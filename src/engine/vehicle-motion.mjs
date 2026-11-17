const HALF_WIDTH = 1.12;
const HALF_LENGTH = 2.30;

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
  const padding = 0.28;
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
