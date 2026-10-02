/** Combine the existing keyboard and virtual stick for any steerable vehicle. */
const EMPTY_STICK = Object.freeze({ x: 0, z: 0 });
const axis = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
export function readVehicleInput(keys, stick = EMPTY_STICK, result = {}) {
  const forward = !!(keys.KeyW || keys.ArrowUp);
  const reverse = !!(keys.KeyS || keys.ArrowDown);
  const left = !!(keys.KeyA || keys.ArrowLeft);
  const right = !!(keys.KeyD || keys.ArrowRight);
  result.throttle = forward || reverse ? Number(forward) - Number(reverse) : -axis(stick.z);
  result.steer = left || right ? Number(right) - Number(left) : axis(stick.x);
  return result;
}
