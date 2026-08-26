/**
 * jazz.js — NOIR JAZZ, the centerpiece: a generative smoky-jazz score, fully
 * synthesized in WebAudio. D minor, 84 BPM with real 2:1 swing eighths.
 * Walking upright bass over a ii–V–i + bVI turnaround, brushed drums from
 * filtered noise, sparse band-passed piano comping, a muted-trumpet-style
 * lead playing sparse minor-pentatonic-plus-b5 phrases, and a quiet vinyl
 * crackle bed. Everything gain-stages through one master jazz bus with a
 * gentle lowpass (heard-through-a-club-door character) that swells on the
 * Red Mountain overlook and near theater marquees at night, and ducks near
 * the furnaces. Phrase generation is a seeded, non-repeating random walk —
 * it never loops. Silent no-op until the shared audio bus unlocks.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';

const NOTE_SEMITONE = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function freqForRootSemi(root, semis, octave) {
  const midi = (octave + 1) * 12 + NOTE_SEMITONE[root] + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const BPM = 84;
const BEAT = 60 / BPM;
const SWING_LONG = BEAT * (2 / 3);

// ii – V – i (+ bVI turnaround), 8 bars, D minor.
const PROGRESSION = [
  { root: 'D', bass: 2, intervals: [0, 3, 7, 10] },        // i   Dm7
  { root: 'D', bass: 2, intervals: [0, 3, 7, 10] },        // i   Dm7
  { root: 'E', bass: 2, intervals: [0, 3, 6, 10] },        // ii° Em7b5
  { root: 'A', bass: 2, intervals: [0, 4, 7, 10, 13] },    // V   A7b9
  { root: 'D', bass: 2, intervals: [0, 3, 7, 10] },        // i   Dm7
  { root: 'Bb', bass: 1, intervals: [0, 4, 7, 11] },       // bVI Bbmaj7
  { root: 'E', bass: 2, intervals: [0, 3, 6, 10] },        // ii° Em7b5
  { root: 'A', bass: 2, intervals: [0, 4, 7, 10, 13] },    // V   A7b9
];

// D minor pentatonic + b5 blue note: D F G Ab A C
const LEAD_SCALE = [
  { semis: 0 }, { semis: 3 }, { semis: 5 }, { semis: 6 }, { semis: 7 }, { semis: 10 },
];

export function startJazz(ctx) {
  const { plan, getDayPhase, camera, THREE } = ctx;
  const rng = makeRng(192900);

  let g = null;
  let started = false;

  const overlookPts = (plan.landmarks || [])
    .filter((l) => l.id === 'sentinel-observation-deck' || l.id === 'vulcan-monument')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));
  const marqueePts = (plan.landmarks || [])
    .filter((l) => l.kind === 'theater' || l.id === 'club-savoy')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));
  const furnacePts = (plan.landmarks || [])
    .filter((l) => l.kind === 'furnace')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));

  function buildGraph() {
    const audio = getAudio();
    if (!audio) return null;
    const { ctx: ac, master } = audio;

    const jazzBus = ac.createGain();
    jazzBus.gain.value = 0.16;
    const jazzLP = ac.createBiquadFilter();
    jazzLP.type = 'lowpass';
    jazzLP.frequency.value = 1900;
    jazzLP.Q.value = 0.4;
    jazzBus.connect(jazzLP);
    jazzLP.connect(master);

    const bassBus = ac.createGain(); bassBus.gain.value = 0.9; bassBus.connect(jazzBus);
    const drumBus = ac.createGain(); drumBus.gain.value = 0.55; drumBus.connect(jazzBus);
    const pianoBus = ac.createGain(); pianoBus.gain.value = 0.5; pianoBus.connect(jazzBus);
    const leadBus = ac.createGain(); leadBus.gain.value = 0.8; leadBus.connect(jazzBus);
    const crackleBus = ac.createGain(); crackleBus.gain.value = 0.35; crackleBus.connect(jazzBus);

    const rideBuf = makeNoiseBuffer(ac, 1, rng);
    const snareBuf = makeNoiseBuffer(ac, 1, rng);
    const crackleBuf = makeNoiseBuffer(ac, 1, rng);

    const leadFilter = ac.createBiquadFilter();
    leadFilter.type = 'bandpass';
    leadFilter.frequency.value = 900;
    leadFilter.Q.value = 3;
    leadFilter.connect(leadBus);
    const leadWahLFO = ac.createOscillator();
    leadWahLFO.type = 'sine';
    leadWahLFO.frequency.value = 0.11;
    const wahDepth = ac.createGain();
    wahDepth.gain.value = 380;
    leadWahLFO.connect(wahDepth);
    wahDepth.connect(leadFilter.frequency);
    leadWahLFO.start();

    return {
      ac, jazzBus, jazzLP, bassBus, drumBus, pianoBus, leadBus, crackleBus,
      rideBuf, snareBuf, crackleBuf, leadFilter,
    };
  }

  function pluckBass(freq, t, dur) {
    const { ac, bassBus } = g;
    const o1 = ac.createOscillator(); o1.type = 'sine';
    const o2 = ac.createOscillator(); o2.type = 'triangle';
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq, t);
    const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.55, t + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
    o1.connect(gn); o2.connect(gn); gn.connect(filt); filt.connect(bassBus);
    o1.start(t); o2.start(t); o1.stop(t + dur); o2.stop(t + dur);
  }

  function rideTick(t, accent) {
    const { ac, drumBus, rideBuf } = g;
    const src = ac.createBufferSource(); src.buffer = rideBuf;
    src.playbackRate.value = 2.2 + rng() * 0.4;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 7200; bp.Q.value = 2.2;
    const gn = ac.createGain();
    const peak = accent ? 0.2 : 0.1;
    const dur = accent ? 0.22 : 0.11;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(peak, t + 0.004);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(gn); gn.connect(drumBus);
    src.start(t); src.stop(t + 0.3);
  }

  function brushSnare(t) {
    const { ac, drumBus, snareBuf } = g;
    const src = ac.createBufferSource(); src.buffer = snareBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    bp.Q.value = 0.8;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.15, t + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(bp); bp.connect(gn); gn.connect(drumBus);
    src.start(t); src.stop(t + 0.3);
  }

  function pianoStab(freqs, t) {
    const { ac, pianoBus } = g;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.13, t + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3.5;
    gn.connect(bp); bp.connect(pianoBus);
    for (const f of freqs) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o.connect(gn); o.start(t); o.stop(t + 0.34);
    }
  }

  function crackleTick(t) {
    const { ac, crackleBus, crackleBuf } = g;
    const src = ac.createBufferSource(); src.buffer = crackleBuf;
    src.playbackRate.value = 3 + rng() * 3;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.02 + rng() * 0.03, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(gn); gn.connect(crackleBus);
    src.start(t); src.stop(t + 0.06);
  }

  function trumpetNote(freq, t, dur) {
    const { ac, leadFilter } = g;
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
    const vib = ac.createOscillator(); vib.type = 'sine'; vib.frequency.value = 4.6;
    const vibDepth = ac.createGain();
    vibDepth.gain.setValueAtTime(0.0, t);
    vibDepth.gain.linearRampToValueAtTime(freq * 0.012, t + 0.5);
    vib.connect(vibDepth); vibDepth.connect(o.frequency);
    vib.start(t); vib.stop(t + dur + 0.1);
    const gn = ac.createGain();
    const attack = Math.min(0.25, dur * 0.3);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.45, t + attack);
    gn.gain.setValueAtTime(0.45, t + Math.max(attack, dur * 0.6));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(leadFilter);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const LOOKAHEAD = 0.2;
  let nextBeatTime = 0;
  let beatCount = 0;
  let barIndex = 0;
  let leadNextTime = 0;
  let leadDegree = 0;
  let crackleNext = 0;

  function scheduleBeat(t) {
    const chordIdx = barIndex % PROGRESSION.length;
    const chord = PROGRESSION[chordIdx];
    const beatInBar = beatCount % 4;
    const tones = chord.intervals;

    let semis;
    if (beatInBar === 0) semis = tones[0];
    else if (beatInBar === 3) semis = tones[0] + (rng() < 0.5 ? 1 : -1);
    else semis = tones[1 + Math.floor(rng() * (tones.length - 1))];

    const bassFreq = freqForRootSemi(chord.root, semis, chord.bass);
    pluckBass(bassFreq, t, BEAT * 0.95);

    rideTick(t, beatInBar === 0);
    if (beatInBar === 1 || beatInBar === 3) brushSnare(t + SWING_LONG * 0.5);

    const upbeatT = t + SWING_LONG;
    rideTick(upbeatT, false);
    if (rng() > 0.5) {
      const voicing = tones.slice(0, 4).map((iv) => freqForRootSemi(chord.root, iv, 4));
      pianoStab(voicing, upbeatT + 0.01);
    }
  }

  function scheduleLead(scheduleTo) {
    while (leadNextTime < scheduleTo) {
      const rest = rng() < 0.42;
      const durBeats = 1 + Math.floor(rng() * 4); // 1..4 beats — long holds, real space
      const t = leadNextTime;
      if (!rest) {
        const step = Math.floor(rng() * 5) - 2; // -2..2 random walk
        leadDegree = Math.max(-3, Math.min(6, leadDegree + step));
        const scaleLen = LEAD_SCALE.length;
        const idx = ((leadDegree % scaleLen) + scaleLen) % scaleLen;
        const octaveShift = 4 + Math.floor(leadDegree / scaleLen);
        const freq = freqForRootSemi('D', LEAD_SCALE[idx].semis, octaveShift);
        trumpetNote(freq, t + 0.02, durBeats * BEAT * 0.85);
      }
      leadNextTime += durBeats * BEAT;
    }
  }

  function scheduleCrackle(scheduleTo) {
    while (crackleNext < scheduleTo) {
      crackleTick(crackleNext);
      crackleNext += 0.25 + rng() * 1.1;
    }
  }

  function tick() {
    const now = g.ac.currentTime;
    const scheduleTo = now + LOOKAHEAD;
    while (nextBeatTime < scheduleTo) {
      scheduleBeat(nextBeatTime);
      beatCount++;
      if (beatCount % 4 === 0) barIndex++;
      nextBeatTime += BEAT;
    }
    scheduleLead(scheduleTo);
    scheduleCrackle(scheduleTo);
  }

  function init() {
    g = buildGraph();
    if (!g) return;
    const now = g.ac.currentTime + 0.1;
    nextBeatTime = now;
    leadNextTime = now + BEAT * 2;
    crackleNext = now;
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
      const furnaceD = nearestDist(furnacePts);
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;

      const swell = Math.max(
        Math.max(0, 1 - overlookD / 220),
        night * Math.max(0, 1 - marqueeD / 130)
      );
      const duck = Math.max(0, 1 - furnaceD / 260);

      const targetGain = Math.max(0.02, 0.16 + swell * 0.22 - duck * 0.13);
      const targetCutoff = Math.max(300, 1900 + swell * 1400 - duck * 1300);
      g.jazzBus.gain.setTargetAtTime(targetGain, g.ac.currentTime, 1.2);
      g.jazzLP.frequency.setTargetAtTime(targetCutoff, g.ac.currentTime, 1.2);
    },
  };
}
