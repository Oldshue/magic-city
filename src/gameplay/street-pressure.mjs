/** Renderer-independent consequences for witnessed reckless driving. */
export const STREET_LAW = Object.freeze({
  recklessSpeed: 12, noticeSeconds: 1.5, pursuitSeconds: 4,
  evadeSeconds: 12, captureSeconds: 2.5, captureDistance: 2.8,
});

export function createStreetPressure(law = STREET_LAW) {
  let heat = 0, offence = 0, unseen = 0, capture = 0;
  let phase = 'clear', reason = '', arrests = 0;
  return {
    update(dt, input) {
      if (input.blocked || phase === 'detained' || !Number.isFinite(dt) || dt <= 0) return;
      const witnessed = input.visible === true;
      const reckless = input.driving && Math.abs(input.speed) > law.recklessSpeed;
      if (witnessed && input.driving && input.crashed) {
        heat = 2; reason = 'A patrol witnessed a dangerous collision.';
      } else if (witnessed && reckless) {
        offence += dt;
        if (offence >= law.noticeSeconds) { heat = Math.max(heat, 1); reason = 'A patrol witnessed reckless driving.'; }
        if (offence >= law.pursuitSeconds) heat = 2;
      } else offence = 0;
      if (!heat) return;
      if (witnessed) {
        unseen = 0; phase = heat === 2 ? 'pursuit' : 'watched';
        if (input.nearestDistance <= law.captureDistance && Math.abs(input.speed) < 1) capture += dt;
        else capture = 0;
        if (capture >= law.captureSeconds) { phase = 'detained'; arrests++; }
      } else {
        capture = 0; unseen += dt; phase = 'searching';
        if (unseen >= law.evadeSeconds) { heat = 0; offence = 0; unseen = 0; phase = 'clear'; reason = ''; }
      }
    },
    surrender() {
      if (!heat || phase === 'detained') return false;
      phase = 'detained'; arrests++; return true;
    },
    release() { heat = 0; offence = 0; unseen = 0; capture = 0; phase = 'clear'; reason = ''; },
    snapshot(out = {}) {
      out.heat = heat; out.phase = phase; out.reason = reason; out.arrests = arrests;
      out.escapeRemaining = heat ? Math.max(0, law.evadeSeconds - unseen) : 0;
      out.captureProgress = Math.min(1, capture / law.captureSeconds);
      return out;
    },
  };
}

/** Segment/rectangle occlusion, using the same world collider boxes as movement. */
export function hasStreetSight(ax, az, bx, bz, boxes) {
  const dx = bx - ax, dz = bz - az;
  for (const box of boxes) {
    let near = 0, far = 1;
    if (Math.abs(dx) < 1e-8) { if (ax < box.minX || ax > box.maxX) continue; }
    else {
      let a = (box.minX - ax) / dx, b = (box.maxX - ax) / dx;
      if (a > b) { const swap = a; a = b; b = swap; }
      near = Math.max(near, a); far = Math.min(far, b);
    }
    if (Math.abs(dz) < 1e-8) { if (az < box.minZ || az > box.maxZ) continue; }
    else {
      let a = (box.minZ - az) / dz, b = (box.maxZ - az) / dz;
      if (a > b) { const swap = a; a = b; b = swap; }
      near = Math.max(near, a); far = Math.min(far, b);
    }
    if (near <= far && far > 0.001 && near < 0.999) return false;
  }
  return true;
}
