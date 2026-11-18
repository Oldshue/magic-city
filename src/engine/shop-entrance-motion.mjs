export const ENTRANCE_SWING = 1.61;
export const ENTRANCE_THICKNESS = .07;
const OPEN_TIME = .39;
const CLOSE_TIME = .94;
const OPEN_HOLD = .48;
const BELL_ANGLE = .19;

export function approachesDoor(across, depth, step, width) {
  return across > .17 && across < width-.17
    && depth > -1.92 && depth < 1.70
    && Math.abs(step) > .002 && depth * step < 0;
}

export function occupiesDoorway(across, depth, radius, width) {
  return across > -radius && across < width+radius && depth < radius+.045
    && Math.hypot(across,Math.min(0,depth)) < width+radius;
}

/** Circle against the rotated physical leaf, in coordinates relative to the jamb. */
export function hitsDoorLeaf(across, depth, radius, width, angle) {
  const sine = Math.sin(angle), cosine = Math.cos(angle);
  const along = across*cosine - depth*sine;
  const normal = across*sine + depth*cosine;
  const end = Math.max(0,-along,along-width);
  const side = Math.max(0,Math.abs(normal)-ENTRANCE_THICKNESS*.5);
  return end*end + side*side < radius*radius;
}

export function createEntranceMotion() {
  let travel = 0, angle = 0, hold = 0, rung = false, bell = .97;
  return {
    get angle() { return angle; },
    get bell() { return bell; },
    update(dt, requested, occupied) {
      hold = requested || occupied ? OPEN_HOLD : Math.max(0,hold-dt);
      const opening = hold > 0;
      const from = travel;
      travel = opening ? Math.min(1,travel+dt/OPEN_TIME) : Math.max(0,travel-dt/CLOSE_TIME);
      angle = ENTRANCE_SWING * travel*travel*(3-2*travel);
      const ring = !rung && opening && angle >= BELL_ANGLE;
      const latch = from > 0 && travel === 0;
      if (ring) rung = true;
      if (latch) rung = false;
      bell = ring ? 0 : Math.min(.97,bell+dt);
      return ring ? 'ring' : latch ? 'latch' : '';
    },
  };
}
