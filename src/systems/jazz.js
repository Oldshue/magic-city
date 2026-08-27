/**
 * jazz.js — the city's music, played from real records.
 *
 * Synthesis is gone. The score is four public-domain 78rpm sides recorded
 * 1923–1925 (all pre-1926, US sound-recording public domain under the
 * Music Modernization Act; see data/music/playlist.json for the ledger):
 * slow moody blues for the night streets, Oliver/Henderson sides for the
 * day. What you hear is a real 1920s band on shellac — surface crackle
 * and all — which is also exactly what 1929 Birmingham heard.
 *
 * The player keeps the located audio staging from the synthesized era:
 *   - a gentle high shelf plus a *located* club-door lowpass (the music
 *     muffles believably when you stand right at a venue door),
 *   - an overlook/marquee swell and a furnace-district duck,
 *   - a soft needle-crackle bed that carries the gap between sides.
 *
 * Records are fetched from the repo's own data/ directory (same-origin
 * static assets, fetched exactly like data/city-plan.json — no external
 * network) and decoded once, lazily. Silent no-op until the shared audio
 * bus unlocks. Hermetic: no window / location / globalThis identifiers.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';

const TRACKS = [
  { file: '../../data/music/gulf-coast-blues-1923.mp3', mood: 'night' },
  { file: '../../data/music/my-man-blues-1925.mp3', mood: 'night' },
  { file: '../../data/music/meanest-kind-o-blues-1924.mp3', mood: 'day' },
  { file: '../../data/music/tears-1923.mp3', mood: 'day' },
];
const GAP_SECONDS = 3.2; // needle lifts, crackle breathes, next side drops

export function startJazz(ctx) {
  const { plan, getDayPhase, camera, THREE } = ctx;
  const rng = makeRng(78192600);

  let g = null;
  let started = false;

  const overlookPts = (plan.landmarks || [])
    .filter((l) => l.id === 'sentinel-observation-deck' || l.id === 'vulcan-monument')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));
  const marqueePts = (plan.landmarks || [])
    .filter((l) => l.kind === 'theater' || l.id === 'club-savoy')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));
  const doorPts = marqueePts;
  const furnacePts = (plan.landmarks || [])
    .filter((l) => l.kind === 'furnace')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));

  function buildGraph() {
    const audio = getAudio();
    if (!audio) return null;
    const { ctx: ac, master } = audio;

    const jazzBus = ac.createGain();
    jazzBus.gain.value = 0.8;

    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3400;
    shelf.gain.value = -1.5;

    const doorLP = ac.createBiquadFilter();
    doorLP.type = 'lowpass';
    doorLP.frequency.value = 18000; // wide open; swept only right at a venue door
    doorLP.Q.value = 0.3;

    jazzBus.connect(shelf);
    shelf.connect(doorLP);
    doorLP.connect(master);

    // The record itself.
    const musicGain = ac.createGain();
    musicGain.gain.value = 0.9;
    musicGain.connect(jazzBus);

    // Soft needle bed for the gaps between sides.
    const crackleBus = ac.createGain();
    crackleBus.gain.value = 0.0;
    crackleBus.connect(jazzBus);
    const crackleSrc = ac.createBufferSource();
    crackleSrc.buffer = makeNoiseBuffer(ac, 2, rng);
    crackleSrc.loop = true;
    const crackleBP = ac.createBiquadFilter();
    crackleBP.type = 'bandpass';
    crackleBP.frequency.value = 4200;
    crackleBP.Q.value = 0.5;
    const crackleTrim = ac.createGain();
    crackleTrim.gain.value = 0.05;
    crackleSrc.connect(crackleBP);
    crackleBP.connect(crackleTrim);
    crackleTrim.connect(crackleBus);
    crackleSrc.start();

    return { ac, jazzBus, shelf, doorLP, musicGain, crackleBus };
  }

  // ---- Record library: lazy fetch + decode, one shot each ----------------
  const buffers = new Map(); // file -> AudioBuffer | 'loading' | 'failed'
  function loadTrack(file) {
    if (buffers.has(file)) return;
    buffers.set(file, 'loading');
    fetch(file)
      .then((r) => r.arrayBuffer())
      .then((ab) => g.ac.decodeAudioData(ab))
      .then((buf) => buffers.set(file, buf))
      .catch(() => buffers.set(file, 'failed'));
  }

  function pickNext() {
    const phase = getDayPhase();
    const night = phase < 0.24 || phase > 0.78;
    const mood = night ? 'night' : 'day';
    const pool = TRACKS.filter((t) => t.mood === mood && t.file !== lastFile);
    const all = pool.length ? pool : TRACKS.filter((t) => t.file !== lastFile);
    return all[Math.floor(rng() * all.length)] || TRACKS[0];
  }

  let current = null;      // { source, file, endsAt }
  let lastFile = null;
  let nextAt = 0;          // ac.currentTime when the next side should drop
  let pending = null;      // track chosen and loading for the next drop

  function dropNeedle(track, buf) {
    const t = g.ac.currentTime + 0.05;
    const src = g.ac.createBufferSource();
    src.buffer = buf;
    src.connect(g.musicGain);
    src.start(t);
    current = { source: src, file: track.file, endsAt: t + buf.duration };
    lastFile = track.file;
    pending = null;
    nextAt = current.endsAt + GAP_SECONDS;
    // Needle bed swells softly through the gap edges, ducks under the music.
    g.crackleBus.gain.cancelScheduledValues(t);
    g.crackleBus.gain.setTargetAtTime(0.25, t, 0.8);
    g.crackleBus.gain.setTargetAtTime(0.9, current.endsAt - 0.5, 0.4);
  }

  function tick() {
    const now = g.ac.currentTime;
    if (!pending && (!current || now > nextAt - 12)) {
      // Choose the next side a few bars early so decode is done in time.
      pending = pickNext();
      loadTrack(pending.file);
    }
    const playing = current && now < current.endsAt;
    if (!playing && pending && now >= (current ? nextAt : 0)) {
      const buf = buffers.get(pending.file);
      if (buf && buf !== 'loading' && buf !== 'failed') {
        dropNeedle(pending, buf);
      } else if (buf === 'failed') {
        buffers.delete(pending.file);
        pending = null; // try a different side next tick
      }
    }
    if (!playing) {
      // Between sides: the needle bed breathes on its own.
      g.crackleBus.gain.setTargetAtTime(0.9, now, 0.6);
    }
  }

  function init() {
    g = buildGraph();
    if (!g) return;
    nextAt = 0;
    started = true;
  }
  onReady(init);

  const tmp = new THREE.Vector2();
  function nearestDist(pts) {
    let d = Infinity;
    for (const p of pts) {
      const dd = tmp.distanceTo(p);
      if (dd < d) d = dd;
    }
    return d;
  }

  return {
    update() {
      if (!started || !g) return;
      tick();

      tmp.set(camera.position.x, camera.position.z);
      const overlookD = nearestDist(overlookPts);
      const marqueeD = nearestDist(marqueePts);
      const doorD = nearestDist(doorPts);
      const furnaceD = nearestDist(furnacePts);
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;

      const swell = Math.max(
        Math.max(0, 1 - overlookD / 220),
        night * Math.max(0, 1 - marqueeD / 130)
      );
      const duck = Math.max(0, 1 - furnaceD / 260);
      const doorMuffle = Math.max(0, 1 - doorD / 18);

      const targetGain = Math.max(0.15, 0.8 + swell * 0.3 - duck * 0.35);
      g.jazzBus.gain.setTargetAtTime(targetGain, g.ac.currentTime, 1.2);

      const doorCutoff = 18000 - doorMuffle * 16500;
      g.doorLP.frequency.setTargetAtTime(Math.max(1200, doorCutoff), g.ac.currentTime, 0.4);
    },
  };
}
