import { LARGE_SEDAN } from './vehicle-motion.mjs';

const SIGHT_RANGE = 25;
const NOD_DURATION = .69;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Rank a sedan by when and where it will intersect this pedestrian's crossing. */
export function crossingVehicleScore(crossing, person, car) {
  const sight = Math.hypot(car.x - person.x, car.z - person.z);
  if (sight > SIGHT_RANGE) return Infinity;

  const lateral = crossing.axis;
  const forward = lateral === 'x' ? 'z' : 'x';
  const direction = car.speed < -.05 ? -1 : 1;
  const dx = Math.sin(car.heading) * direction, dz = Math.cos(car.heading) * direction;
  const approach = forward === 'x' ? dx : dz;
  if (Math.abs(approach) < .60) return Infinity;

  const distance = (crossing[forward] - car[forward]) / approach;
  const halfStripe = crossing.depth * .5 / Math.abs(approach);
  const {halfWidth,halfLength} = car.configuration ?? LARGE_SEDAN;
  if (distance < -halfStripe - halfLength || distance > SIGHT_RANGE) return Infinity;

  const lane = car[lateral] + distance * (lateral === 'x' ? dx : dz);
  if (Math.abs(lane - crossing[lateral]) > crossing.halfSpan + halfWidth * .5) return Infinity;

  const stride = lateral === 'x' ? person.vx : person.vz;
  const gap = lane - person[lateral];
  if (person.committed && Math.abs(stride) > .2 && gap * Math.sign(stride) < -1.6) return Infinity;

  const remaining = Math.max(0, distance - halfLength - halfStripe);
  const speed = Math.abs(car.speed);
  if (speed < .3 && !car.yielding && remaining > 2.5) return Infinity;

  return remaining / (1.35 + speed) + .18 * Math.abs(gap);
}

function ease(value, from, to) {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createCrossingAttention() {
  return { curbTime: 0, acknowledged: false, nod: null, yaw: 0, pitch: 0, mode: '' };
}

/** Keep the performance continuous across frames and independent of the render distance. */
export function updateCrossingAttention(state, person, facing, car, dt) {
  if (!person.active) {
    state.curbTime = 0;
    state.acknowledged = false;
    state.nod = null;
    car = null;
  } else if (!person.committed) {
    state.curbTime += dt;
  } else if (!state.acknowledged && car?.yielding && Math.abs(car.speed) < .45
      && Math.hypot(car.x - person.x, car.z - person.z) < 9) {
    state.nod = { x: car.x, z: car.z, time: 0 };
    state.acknowledged = true;
  }

  const nod = state.nod;
  const target = nod ?? car;
  let yaw = 0, pitch = 0, mode = '';
  if (target) {
    const dx = target.x - person.x, dz = target.z - person.z;
    const turn = Math.atan2(dx, dz) - facing;
    yaw = clamp(Math.atan2(Math.sin(turn), Math.cos(turn)), -1.12, 1.12);
    pitch = Math.atan2(.36, Math.hypot(dx, dz));
    mode = 'watching';
    if (nod) {
      const dip = ease(nod.time, 0, .22) * (1 - ease(nod.time, .25, NOD_DURATION));
      pitch += .23 * dip;
      mode = 'nodding';
      nod.time += dt;
      if (nod.time >= NOD_DURATION) state.nod = null;
    }
  } else if (person.active && !person.committed && state.curbTime < 1.85) {
    const t = state.curbTime;
    const near = ease(t, .04, .27) * (1 - ease(t, .54, .86));
    const far = ease(t, .71, 1.01) * (1 - ease(t, 1.27, 1.74));
    yaw = near * .81 - far * .68;
    mode = 'checking';
  }
  const response = 1 - Math.exp(-dt * 10);
  state.yaw += (yaw - state.yaw) * response;
  state.pitch += (pitch - state.pitch) * response;
  state.mode = mode;
}
