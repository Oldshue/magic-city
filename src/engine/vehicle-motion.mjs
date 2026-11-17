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
