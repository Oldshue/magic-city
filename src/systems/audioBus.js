/**
 * audioBus.js — shared WebAudio context and master bus for Magic City 1929.
 *
 * A single AudioContext is created lazily on the first user gesture (click,
 * key, or touch — covering the pointer-lock click) to satisfy browser
 * autoplay policy. If AudioContext is unavailable, or construction throws,
 * every export degrades to a harmless no-op so the rest of the systems
 * layer never has to special-case audio failure.
 */

let ctx = null;
let master = null;
let unlocked = false;
let failed = false;
const gestureEvents = ['pointerdown', 'keydown', 'touchstart'];
let pendingResolvers = [];

function tryCreate() {
  if (ctx || failed) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  } catch (e) {
    failed = true;
    ctx = null;
    master = null;
  }
}

function onGesture() {
  tryCreate();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  if (ctx || failed) {
    unlocked = true;
    const fns = pendingResolvers;
    pendingResolvers = [];
    for (const fn of fns) {
      try { fn(); } catch (e) { /* a subsystem's init blew up; keep going */ }
    }
    for (const ev of gestureEvents) window.removeEventListener(ev, onGesture);
  }
}

for (const ev of gestureEvents) window.addEventListener(ev, onGesture, { passive: true });

/** Returns { ctx, master } once unlocked and available, else null. */
export function getAudio() {
  if (!ctx || failed) return null;
  return { ctx, master };
}

export function isUnlocked() {
  return unlocked;
}

/** Fires fn exactly once, either immediately or on first user gesture. */
export function onReady(fn) {
  if (unlocked) { fn(); return; }
  pendingResolvers.push(fn);
}

/** A short noise buffer for percussion / crackle / rumble shaping. */
export function makeNoiseBuffer(audioCtx, seconds, seedFn) {
  const rate = audioCtx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = audioCtx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  const rnd = seedFn || Math.random;
  for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
  return buf;
}

/** Deterministic mulberry32 PRNG so phrase generation is repeatable-but-endless. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
