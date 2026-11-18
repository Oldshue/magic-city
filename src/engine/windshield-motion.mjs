// The sweep advances out and back with eased reversals at each stop.
// Each sample records how recently the blade passed that angle.
export const WIPE_SAMPLES = 96;

export function createWiperMotion({park, far, strokeSeconds}) {
  const freshness = new Float32Array(WIPE_SAMPLES);
  let position = 0, direction = 1, angle = park;

  function markSweep(from, to) {
    const scale = (WIPE_SAMPLES - 1) / (far - park);
    const first = Math.floor((Math.min(from,to) - park) * scale);
    const last = Math.min(WIPE_SAMPLES - 1, Math.ceil((Math.max(from,to) - park) * scale));
    freshness.fill(1, Math.max(0, first), last + 1);
  }

  return {
    freshness,
    get angle() { return angle; },
    update(dt, rain, enabled) {
      const rewet = Math.exp(-dt * rain * .58);
      for (let i = 0; i < freshness.length; i++) freshness[i] *= rewet;

      let travel = dt / strokeSeconds;
      let reversed = false;
      while (travel > 0 && (enabled || position > 0)) {
        const limit = direction > 0 ? 1 : 0;
        const remaining = Math.abs(limit - position);
        const step = Math.min(travel, remaining);
        const next = step === remaining ? limit : position + direction * step;
        const previous = angle;
        position = next;
        angle = park + (far - park) * (.5 - .5 * Math.cos(Math.PI * position));
        markSweep(previous, angle);
        travel -= step;
        if (position === limit) {
          direction *= -1;
          reversed = true;
        }
      }
      return reversed;
    },
  };
}
