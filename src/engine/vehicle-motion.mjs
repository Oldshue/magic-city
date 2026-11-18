export const HALF_WIDTH = 1.12;
export const HALF_LENGTH = 2.30;
const CAMERA_PADDING = .28;

/** Test the sedan footprint against the four separating axes of a building box. */
export function carFootprintBlocked(boxes, x, z, heading, {halfWidth, halfLength} = LARGE_SEDAN) {
  const sx = Math.sin(heading), cx = Math.cos(heading);
  const sin = Math.abs(sx), cos = Math.abs(cx);
  const reachX = halfWidth * cos + halfLength * sin;
  const reachZ = halfWidth * sin + halfLength * cos;
  for (const box of boxes) {
    if (x + reachX <= box.minX || x - reachX >= box.maxX
        || z + reachZ <= box.minZ || z - reachZ >= box.maxZ) continue;
    const halfX = (box.maxX - box.minX) / 2;
    const halfZ = (box.maxZ - box.minZ) / 2;
    const dx = box.minX + halfX - x;
    const dz = box.minZ + halfZ - z;
    const across = Math.abs(dx * cx - dz * sx);
    const along = Math.abs(dx * sx + dz * cx);
    if (across < halfWidth + halfX * cos + halfZ * sin
        && along < halfLength + halfX * sin + halfZ * cos) return true;
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
export function driverApproach(boxes, x, z, heading, fromX, fromZ, {driverMark, halfWidth, halfLength} = LARGE_SEDAN) {
  const sine = Math.sin(heading), cosine = Math.cos(heading);
  const dx = fromX-x, dz = fromZ-z;
  const side = dx*cosine - dz*sine;
  const along = dx*sine + dz*cosine;
  const door = [driverMark.x, driverMark.z];
  const sideClearance = halfWidth+.12;
  const endClearance = halfLength+.26;
  const left = side > 0 ? driverMark.x : -driverMark.x;
  const around = halfLength+.38;
  const candidates = [-around, around].map(end =>
    [[left,end], [driverMark.x,end], door]);
  if (side >= sideClearance) candidates.unshift([door]);
  else if (Math.abs(along) >= endClearance) candidates.unshift([[driverMark.x,along],door]);
  let shortest = Infinity, chosen = null;
  for (const path of candidates) {
    if (side < sideClearance && Math.abs(along) < endClearance) path.unshift([left,along]);
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
  const {halfWidth, halfLength} = owner?.configuration ?? LARGE_SEDAN;
  const sine = Math.abs(Math.sin(heading)), cosine = Math.abs(Math.cos(heading));
  const across = halfWidth*cosine + halfLength*sine;
  const along = halfWidth*sine + halfLength*cosine;
  out.minX = x-across; out.maxX = x+across;
  out.minZ = z-along; out.maxZ = z+along;
  out.owner = owner;
  out.x = x; out.z = z; out.heading = heading;
  out.halfWidth = halfWidth; out.halfLength = halfLength;
  return out;
}

export function hitsMovingObstacle(box,x,z,radius) {
  if (box.heading === undefined) {
    return x > box.minX-radius && x < box.maxX+radius
      && z > box.minZ-radius && z < box.maxZ+radius;
  }
  const dx=x-box.x, dz=z-box.z, sine=Math.sin(box.heading), cosine=Math.cos(box.heading);
  const lateral=Math.max(0,Math.abs(dx*cosine-dz*sine)-(box.halfWidth ?? HALF_WIDTH));
  const longitudinal=Math.max(0,Math.abs(dx*sine+dz*cosine)-(box.halfLength ?? HALF_LENGTH));
  return lateral*lateral+longitudinal*longitudinal < radius*radius;
}



/** Project a blocked walking step onto the tangent at the car's closest face. */
export function slideAlongCar(box, x, z, dx, dz) {
  const sine = Math.sin(box.heading), cosine = Math.cos(box.heading);
  const localX = (x - box.x) * cosine - (z - box.z) * sine;
  const localZ = (x - box.x) * sine + (z - box.z) * cosine;
  const width = box.halfWidth ?? HALF_WIDTH, length = box.halfLength ?? HALF_LENGTH;
  const offsetX = localX - Math.max(-width, Math.min(width, localX));
  const offsetZ = localZ - Math.max(-length, Math.min(length, localZ));
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
function sedanConfiguration(properties) {
  return Object.freeze({...properties, wheelbase:properties.frontAxleZ-properties.rearAxleZ});
}

export const MAX_SPEED = 22;
export const LARGE_SEDAN = sedanConfiguration({
  halfWidth:HALF_WIDTH, halfLength:HALF_LENGTH, halfTrack:HALF_TRACK, tyreRadius:TYRE_RADIUS,
  frontAxleZ:FRONT_AXLE_Z, rearAxleZ:REAR_AXLE_Z, driverMark:DRIVER_MARK,
  seatOffset:[0,0,0], steeringLock:.49, grip:5.4, steeringResponse:10,
  maxSpeed:MAX_SPEED, reverseLimit:6, acceleration:8.1, powerFade:4.5, reversePower:4.2,
  serviceBrake:9.8, parkingBrake:11, coastDrag:2.85, crossingBrake:7.4, emergencyBrake:10.4,
  springDamping:8, springFrequency:Math.sqrt(125-8*8), pitchResponse:.0066, rollResponse:.0125,
  idleNote:38, engineRange:65,
});

// The 103.5-inch wheelbase matches Ford's A passenger chassis. The
// acceleration and brake rates are tuned for the game's continuous controls.
export const FORD_TUDOR = sedanConfiguration({
  halfWidth:.89, halfLength:1.99, halfTrack:.707, tyreRadius:.368,
  frontAxleZ:1.315, rearAxleZ:-1.3139, driverMark:{x:1.315,z:-.16},
  seatOffset:[-.054,.018,-.010], steeringLock:.576, grip:4.9, steeringResponse:11,
  maxSpeed:18.5, reverseLimit:4.8, acceleration:5.7, powerFade:3, reversePower:3.4,
  serviceBrake:7.7, parkingBrake:9, coastDrag:3.05, crossingBrake:6.2, emergencyBrake:8.4,
  springDamping:7.25, springFrequency:7.8, pitchResponse:.009, rollResponse:.0158,
  idleNote:33, engineRange:56,
});

export function stepSedanControls(car, throttle, steer, parking, dt) {
  const config = car.configuration ?? LARGE_SEDAN;
  const speed = car.speed;
  car.braking = parking || throttle * speed < -0.05;
  if (car.braking || !throttle) {
    const deceleration = parking ? config.parkingBrake
      : car.braking ? config.serviceBrake * Math.abs(throttle) : config.coastDrag;
    car.speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - deceleration * dt);
  } else {
    const acceleration = throttle > 0
      ? config.acceleration - config.powerFade * Math.max(0, speed / config.maxSpeed)
      : config.reversePower;
    car.speed = Math.max(-config.reverseLimit, Math.min(config.maxSpeed, speed + acceleration * throttle * dt));
  }
  const gripAngle = Math.atan2(config.grip * config.wheelbase, car.speed * car.speed);
  const target = steer * Math.min(config.steeringLock, gripAngle);
  car.steeringAngle = target + (car.steeringAngle - target) * Math.exp(-config.steeringResponse * dt);
}

export function sedanYawRate(speed, steering, wheelbase = LARGE_SEDAN.wheelbase) {
  return speed * Math.tan(steering) / wheelbase;
}

export function frontWheelAngle(steering, wheelX, wheelbase = LARGE_SEDAN.wheelbase) {
  const tangent = Math.tan(steering);
  return Math.atan2(tangent, 1 - tangent * wheelX / wheelbase);
}

export function createSedanRide(configuration = LARGE_SEDAN) {
  const spring = () => ({ value: 0, velocity: 0 });
  return { configuration, heave:spring(), pitch:spring(), roll:spring(), support:new Float64Array(4), ready:false };
}

// Exact response to a constant target over this step. It stays damped
// through a long browser frame without giving the chassis a sudden kick.
function advanceSpring(spring, target, decay, damping, stiffness, cosine, sineOverFrequency) {
  const displacement = spring.value - target;
  const velocity = spring.velocity;
  spring.value = target + decay * (displacement * cosine + (velocity + damping * displacement) * sineOverFrequency);
  spring.velocity = decay * (velocity * cosine - (damping * velocity + stiffness * displacement) * sineOverFrequency);
}

export function stepSedanRide(ride, forwardAcceleration, lateralAcceleration, dt) {
  const config = ride.configuration;
  const [leftFront, leftRear, rightFront, rightRear] = ride.support;
  const front = (leftFront + rightFront) * 0.5;
  const rear = (leftRear + rightRear) * 0.5;
  const heave = (front + rear) * 0.5;
  const pitch = Math.atan2(rear - front, config.wheelbase)
    + Math.max(-0.056, Math.min(0.075, -forwardAcceleration * config.pitchResponse));
  const roll = Math.atan2((rightFront + rightRear - leftFront - leftRear) * 0.5, config.halfTrack * 2)
    + Math.max(-0.085, Math.min(0.085, lateralAcceleration * config.rollResponse));
  if (!ride.ready) {
    ride.heave.value = heave;
    ride.pitch.value = pitch;
    ride.roll.value = roll;
    ride.heave.velocity = ride.pitch.velocity = ride.roll.velocity = 0;
    ride.ready = true;
    return;
  }

  const {springFrequency:frequency, springDamping:damping} = config;
  const stiffness = frequency * frequency + damping * damping;
  const decay = Math.exp(-damping * dt);
  const cosine = Math.cos(frequency * dt);
  const sineOverFrequency = Math.sin(frequency * dt) / frequency;
  advanceSpring(ride.heave, heave, decay, damping, stiffness, cosine, sineOverFrequency);
  advanceSpring(ride.pitch, pitch, decay, damping, stiffness, cosine, sineOverFrequency);
  advanceSpring(ride.roll, roll, decay, damping, stiffness, cosine, sineOverFrequency);

  // The bump stops limit how far a tire can rise into the fender arch.
  const sideLift = config.halfTrack * Math.sin(ride.roll.value);
  const noseDip = Math.sin(ride.pitch.value);
  const minimumHeave = Math.max(
    leftFront + sideLift + config.frontAxleZ * noseDip,
    leftRear + sideLift + config.rearAxleZ * noseDip,
    rightFront - sideLift + config.frontAxleZ * noseDip,
    rightRear - sideLift + config.rearAxleZ * noseDip,
  ) - 0.063;
  if (ride.heave.value < minimumHeave) {
    ride.heave.value = minimumHeave;
    ride.heave.velocity = Math.max(0, ride.heave.velocity);
  }
}
