export const HALF_WIDTH = 1.12;
export const HALF_LENGTH = 2.30;
const CAMERA_PADDING = .28;

/** Test the sedan footprint against the four separating axes of a building box. */
export function carFootprintBlocked(boxes, x, z, heading) {
  const sx = Math.sin(heading), cx = Math.cos(heading);
  const sin = Math.abs(sx), cos = Math.abs(cx);
  const reachX = HALF_WIDTH * cos + HALF_LENGTH * sin;
  const reachZ = HALF_WIDTH * sin + HALF_LENGTH * cos;
  for (const box of boxes) {
    if (x + reachX <= box.minX || x - reachX >= box.maxX
        || z + reachZ <= box.minZ || z - reachZ >= box.maxZ) continue;
    const halfX = (box.maxX - box.minX) / 2;
    const halfZ = (box.maxZ - box.minZ) / 2;
    const dx = box.minX + halfX - x;
    const dz = box.minZ + halfZ - z;
    const across = Math.abs(dx * cx - dz * sx);
    const along = Math.abs(dx * sx + dz * cx);
    if (across < HALF_WIDTH + halfX * cos + halfZ * sin
        && along < HALF_LENGTH + halfX * sin + halfZ * cos) return true;
  }
  return false;
}

/** Stop a camera boom just short of the first occupied building footprint. */
export function clearCameraFraction(boxes, x, z, targetX, targetZ) {
  const dx = targetX - x, dz = targetZ - z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return 1;
  const padding = CAMERA_PADDING;
  let clear = 1;
  for (const box of boxes) {
    let near = 0, far = clear;
    const minX = box.minX - padding, maxX = box.maxX + padding;
    const minZ = box.minZ - padding, maxZ = box.maxZ + padding;
    if (Math.abs(dx) < 1e-7) {
      if (x <= minX || x >= maxX) continue;
    } else {
      const a = (minX - x) / dx, b = (maxX - x) / dx;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (Math.abs(dz) < 1e-7) {
      if (z <= minZ || z >= maxZ) continue;
    } else {
      const a = (minZ - z) / dz, b = (maxZ - z) / dz;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (near <= far && near < clear) clear = Math.max(0, near - 0.08 / length);
  }
  return clear;
}
export const DRIVER_MARK = {x:1.54,z:-0.18};

export function carWorldPoint(x, z, heading, localX, localZ) {
  const sine = Math.sin(heading), cosine = Math.cos(heading);
  return [x + localX*cosine + localZ*sine, z - localX*sine + localZ*cosine];
}

/** Choose a clear path around the nose or tail when the driver door is on the far side. */
export function driverApproach(boxes, x, z, heading, fromX, fromZ) {
  const sine = Math.sin(heading), cosine = Math.cos(heading);
  const dx = fromX-x, dz = fromZ-z;
  const side = dx*cosine - dz*sine;
  const along = dx*sine + dz*cosine;
  const door = [DRIVER_MARK.x, DRIVER_MARK.z];
  const left = side > 0 ? DRIVER_MARK.x : -DRIVER_MARK.x;
  const candidates = [-2.68, 2.68].map(end =>
    [[left,end], [DRIVER_MARK.x,end], door]);
  if (side >= 1.24) candidates.unshift([door]);
  else if (Math.abs(along) >= 2.56) candidates.unshift([[DRIVER_MARK.x,along],door]);
  let shortest = Infinity, chosen = null;
  for (const path of candidates) {
    if (side < 1.24 && Math.abs(along) < 2.56) path.unshift([left,along]);
    let lastX = fromX, lastZ = fromZ, length = 0;
    const world = path.map(([lx,lz])=>carWorldPoint(x,z,heading,lx,lz));
    for (const [nextX,nextZ] of world) {
      // At a facade edge, allow a step straight away from its camera
      // padding. Steps through the wall still fail the same segment test.
      const ahead = boxes.filter(box=>!(
        (lastX <= box.minX && nextX < box.minX-CAMERA_PADDING)
        || (lastX >= box.maxX && nextX > box.maxX+CAMERA_PADDING)
        || (lastZ <= box.minZ && nextZ < box.minZ-CAMERA_PADDING)
        || (lastZ >= box.maxZ && nextZ > box.maxZ+CAMERA_PADDING)
      ));
      if (clearCameraFraction(ahead,lastX,lastZ,nextX,nextZ) < 1) {
        length = Infinity;
        break;
      }
      length += Math.hypot(nextX-lastX,nextZ-lastZ);
      lastX = nextX;
      lastZ = nextZ;
    }
    if (length < shortest) {
      shortest = length;
      chosen = world;
    }
  }
  return chosen;
}

export function setCarBounds(out,x,z,heading,owner) {
  const sine = Math.abs(Math.sin(heading)), cosine = Math.abs(Math.cos(heading));
  const across = HALF_WIDTH*cosine + HALF_LENGTH*sine;
  const along = HALF_WIDTH*sine + HALF_LENGTH*cosine;
  out.minX = x-across; out.maxX = x+across;
  out.minZ = z-along; out.maxZ = z+along;
  out.owner = owner;
  out.x = x; out.z = z; out.heading = heading;
  return out;
}

export function hitsMovingObstacle(box,x,z,radius) {
  if (box.heading === undefined) {
    return x > box.minX-radius && x < box.maxX+radius
      && z > box.minZ-radius && z < box.maxZ+radius;
  }
  const dx=x-box.x, dz=z-box.z, sine=Math.sin(box.heading), cosine=Math.cos(box.heading);
  const lateral=Math.max(0,Math.abs(dx*cosine-dz*sine)-HALF_WIDTH);
  const longitudinal=Math.max(0,Math.abs(dx*sine+dz*cosine)-HALF_LENGTH);
  return lateral*lateral+longitudinal*longitudinal < radius*radius;
}



/** Project a blocked walking step onto the tangent at the car's closest face. */
export function slideAlongCar(box, x, z, dx, dz) {
  const sine = Math.sin(box.heading), cosine = Math.cos(box.heading);
  const localX = (x - box.x) * cosine - (z - box.z) * sine;
  const localZ = (x - box.x) * sine + (z - box.z) * cosine;
  const offsetX = localX - Math.max(-HALF_WIDTH, Math.min(HALF_WIDTH, localX));
  const offsetZ = localZ - Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, localZ));
  const lengthSquared = offsetX * offsetX + offsetZ * offsetZ;
  if (lengthSquared < 1e-8) return null;
  const nx = offsetX * cosine + offsetZ * sine;
  const nz = -offsetX * sine + offsetZ * cosine;
  const approach = (dx * nx + dz * nz) / lengthSquared;
  if (approach >= 0) return null;
  return [dx - approach * nx, dz - approach * nz];
}

export const TYRE_RADIUS = 0.385;
export const HALF_TRACK = 0.89;
export const FRONT_AXLE_Z = 1.46;
export const REAR_AXLE_Z = -1.57;
const WHEELBASE = FRONT_AXLE_Z - REAR_AXLE_Z;
export const MAX_SPEED = 22;
const MAX_REVERSE = 6;
const STEERING_LOCK = 0.49;
const CORNER_GRIP = 5.4;

export function stepSedanControls(car, throttle, steer, parking, dt) {
  const speed = car.speed;
  car.braking = parking || throttle * speed < -0.05;
  if (car.braking || !throttle) {
    const deceleration = parking ? 11 : car.braking ? 9.8 * Math.abs(throttle) : 2.85;
    car.speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - deceleration * dt);
  } else {
    const acceleration = throttle > 0 ? 8.1 - 4.5 * Math.max(0, speed / MAX_SPEED) : 4.2;
    car.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, speed + acceleration * throttle * dt));
  }
  const gripAngle = Math.atan2(CORNER_GRIP * WHEELBASE, car.speed * car.speed);
  const target = steer * Math.min(STEERING_LOCK, gripAngle);
  car.steeringAngle = target + (car.steeringAngle - target) * Math.exp(-10 * dt);
}

export function sedanYawRate(speed, steering) {
  return speed * Math.tan(steering) / WHEELBASE;
}

export function frontWheelAngle(steering, wheelX) {
  const tangent = Math.tan(steering);
  return Math.atan2(tangent, 1 - tangent * wheelX / WHEELBASE);
}

export function createSedanRide() {
  const spring = () => ({ value: 0, velocity: 0 });
  return { heave: spring(), pitch: spring(), roll: spring(), support: new Float64Array(4), ready: false };
}

// Exact response to a constant target over this step. It stays damped
// through a long browser frame without giving the chassis a sudden kick.
function advanceSpring(spring, target, decay, cosine, sineOverFrequency) {
  const displacement = spring.value - target;
  const velocity = spring.velocity;
  spring.value = target + decay * (displacement * cosine + (velocity + 8 * displacement) * sineOverFrequency);
  spring.velocity = decay * (velocity * cosine - (8 * velocity + 125 * displacement) * sineOverFrequency);
}

export function stepSedanRide(ride, forwardAcceleration, lateralAcceleration, dt) {
  const [leftFront, leftRear, rightFront, rightRear] = ride.support;
  const front = (leftFront + rightFront) * 0.5;
  const rear = (leftRear + rightRear) * 0.5;
  const heave = (front + rear) * 0.5;
  const pitch = Math.atan2(rear - front, WHEELBASE)
    + Math.max(-0.056, Math.min(0.075, -forwardAcceleration * 0.0066));
  const roll = Math.atan2((rightFront + rightRear - leftFront - leftRear) * 0.5, HALF_TRACK * 2)
    + Math.max(-0.085, Math.min(0.085, lateralAcceleration * 0.0125));
  if (!ride.ready) {
    ride.heave.value = heave;
    ride.pitch.value = pitch;
    ride.roll.value = roll;
    ride.heave.velocity = ride.pitch.velocity = ride.roll.velocity = 0;
    ride.ready = true;
    return;
  }

  const frequency = Math.sqrt(125 - 8 * 8);
  const decay = Math.exp(-8 * dt);
  const cosine = Math.cos(frequency * dt);
  const sineOverFrequency = Math.sin(frequency * dt) / frequency;
  advanceSpring(ride.heave, heave, decay, cosine, sineOverFrequency);
  advanceSpring(ride.pitch, pitch, decay, cosine, sineOverFrequency);
  advanceSpring(ride.roll, roll, decay, cosine, sineOverFrequency);

  // The bump stops limit how far a tire can rise into the fender arch.
  const sideLift = HALF_TRACK * Math.sin(ride.roll.value);
  const noseDip = Math.sin(ride.pitch.value);
  const minimumHeave = Math.max(
    leftFront + sideLift + FRONT_AXLE_Z * noseDip,
    leftRear + sideLift + REAR_AXLE_Z * noseDip,
    rightFront - sideLift + FRONT_AXLE_Z * noseDip,
    rightRear - sideLift + REAR_AXLE_Z * noseDip,
  ) - 0.063;
  if (ride.heave.value < minimumHeave) {
    ride.heave.value = minimumHeave;
    ride.heave.velocity = Math.max(0, ride.heave.velocity);
  }
}
