/**
 * jazz.js — generative smoky-jazz score for Magic City 1929, fully synthesized
 * in WebAudio. ~80 BPM, D minor home key, correct 2:1 swing.
 *
 * Staged rewrite, now complete:
 *   Tier 1 — timing/mix fixes: swing upbeats at 2/3 of the beat, brush taps
 *     land ON beats 2 and 4, the always-on 1900Hz lowpass is gone (replaced
 *     by a gentle high shelf + a *located* club-door lowpass), a convolver
 *     reverb puts the band in a room.
 *   Tier 2 — real instrument character: a walking upright bass with actual
 *     voice leading (steps, approach tones, occasional skips) and a pluck
 *     transient; percussive stacked-triangle piano with rootless, voice-led
 *     comping voicings and varied comping rhythms (Charleston figures,
 *     anticipations, backbeat stabs, laying out); a muted trumpet built
 *     from two fixed-formant bandpasses (~800Hz and ~1600Hz) in parallel
 *     with vibrato that arrives late in held notes and fall-offs at phrase
 *     ends.
 *   Tier 3 — authored tunes (32-bar AABA, 12-bar slow blues, rubato
 *     nocturne) written as literal melody note data against real chord
 *     changes. The band cycles choruses: a melody statement, then
 *     improvised-feel variation choruses built from a phrase pool that
 *     targets chord tones with approach notes and real rests, then the
 *     melody again — grounded and never audibly looping.
 *   Tier 4 — day/night mood: the tune, density, and humanization looseness
 *     are chosen from getDayPhase() (day = lighter AABA, night = fuller
 *     blues, deep late night = sparse rubato-feel nocturne), decided at
 *     chorus boundaries so the switch is never abrupt.
 *
 * Silent no-op until the shared audio bus unlocks. Hermetic: no window /
 * location / globalThis identifiers anywhere in this module.
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
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function nearestTo(target, candidates) {
  let best = candidates[0], bd = Infinity;
  for (const c of candidates) { const d = Math.abs(c - target); if (d < bd) { bd = d; best = c; } }
  return best;
}

const BPM = 58;
const BEAT = 60 / BPM;
// Correct 2:1 swing: the "long" eighth occupies the first 2/3 of the beat,
// so the swung upbeat lands 2/3 of the way through the beat.
const SWING_UP = BEAT * (2 / 3);

const CHORDS = {
  Dm7: { root: 'D', bass: 2, tones: [0, 3, 7, 10] },
  Dm9: { root: 'D', bass: 2, tones: [0, 3, 7, 10, 14] },
  Dm69: { root: 'D', bass: 2, tones: [0, 3, 7, 9, 14] },
  Em7b5: { root: 'E', bass: 2, tones: [0, 3, 6, 10] },
  Bm7b5: { root: 'B', bass: 1, tones: [0, 3, 6, 10] },
  A7b9: { root: 'A', bass: 2, tones: [0, 4, 7, 10, 13] },
  A7s5: { root: 'A', bass: 2, tones: [0, 4, 8, 10] },
  Bbmaj7: { root: 'Bb', bass: 2, tones: [0, 4, 7, 11] },
  Bbmaj7s11: { root: 'Bb', bass: 2, tones: [0, 4, 7, 11, 18] },
  Gm7: { root: 'G', bass: 2, tones: [0, 3, 7, 10] },
  Gm9: { root: 'G', bass: 2, tones: [0, 3, 7, 10, 14] },
  Fmaj9: { root: 'F', bass: 2, tones: [0, 4, 7, 11, 14] },
};

// ---- Authored tunes --------------------------------------------------
// Real note data, not randomness: melody phrases written against explicit
// chord changes. Melody tuples are [barOffset, beatSlot, durationBeats,
// semitonesAboveD, octave] — beatSlot is an integer beat, or that beat + .5
// for the swung upbeat, so tunes lock to the band's own swing grid.

function shiftMelody(notes, barShift) {
  return notes.map(([b, s, d, se, o]) => [b + barShift, s, d, se, o]);
}

// ---- The theme ------------------------------------------------------
// "Magic City After Hours" — one slow noir theme in the Taxi Driver
// register: a lonely tenor line over lush minor-ninth harmony. Long
// breathed phrases, generous rests, a minor-sixth sigh (D up to Bb) as
// the opening gesture, chromatic settle at the cadences. 16 bars at 58.
const THEME_BARS = [
  'Dm9', 'Dm9', 'Gm9', 'Gm9', 'Fmaj9', 'Bbmaj7s11', 'Em7b5', 'A7b9',
  'Dm9', 'Bm7b5', 'Bbmaj7', 'A7s5', 'Dm9', 'Gm9', 'A7b9', 'Dm69',
];
const THEME_MELODY = [
  [0, 0, 2, 0, 4], [0, 2, 3, 8, 4],            // D… up the minor sixth to Bb, held over the bar
  [1, 1.5, 1.2, 7, 4], [1, 2.8, 1.2, 5, 4],    // A settling to F
  [2, 0, 3, 2, 4],                             // long E over Gm9
  [3, 3, 1, 10, 3],                            // low C pickup
  [4, 0, 3, 0, 4],                             // D held over Fmaj9
  [5, 2, 1.6, 5, 4],                           // F
  [6, 0, 2, 8, 4], [6, 2, 2.4, 7, 4],          // Bb sighing to A, held over
  [7, 1, 3, 5, 4],                             // long F over the A7b9
  [8, 0, 2, 2, 4], [8, 2, 2, 0, 4],            // E, D
  [9, 0, 3, 11, 3],                            // dark C# lean on Bm7b5
  [10, 3, 1, 0, 4],                            // D pickup
  [11, 0, 2, 5, 4], [11, 2, 2, 2, 4],          // F, E over the altered dominant
  [12, 0, 4, 0, 4],                            // home D, long
  [14, 0, 2, 8, 3], [14, 2, 2, 7, 3],          // low Bb-A tail, an octave down
  [15, 0, 4, 0, 4],                            // final D, dying away
];
const TUNE_THEME = { id: 'noir-theme', bars: THEME_BARS, melody: THEME_MELODY };

function pickTune(phase) {
  // One theme, always — the score IS the noir theme. Day-night phase only
  // shades how sparse the variation choruses play.
  const night = phase < 0.22 || phase > 0.8;
  return { tune: TUNE_THEME, density: night ? 0.22 : 0.32 };
}

function nextChorusType(prevType, streak, rngFn) {
  if (prevType === 'melody') return { type: 'variation', streak: 1 };
  if (streak < 2 && rngFn() < 0.55) return { type: 'variation', streak: streak + 1 };
  return { type: 'melody', streak: 0 };
}

function beatsToTime(startTime, beats) {
  const beatInt = Math.floor(beats + 1e-6);
  const frac = beats - beatInt;
  return startTime + beatInt * BEAT + (frac > 0.25 ? SWING_UP : 0);
}

function withPhraseEnds(events) {
  return events.map((e, i) => {
    const next = events[i + 1];
    const gapAfter = next ? next.beats - (e.beats + e.dur) : Infinity;
    return { beats: e.beats, dur: e.dur, freq: e.freq, phraseEnd: gapAfter > 0.75 };
  });
}

function buildMelodyEventsFromNotes(notes) {
  return notes.map(([barOffset, beatSlot, dur, semis, oct]) => ({
    beats: barOffset * 4 + beatSlot,
    dur,
    freq: freqForRootSemi('D', semis, oct),
  }));
}
function buildMelodyEvents(tune) {
  return buildMelodyEventsFromNotes(tune.melody);
}

function nearestPitchClassMidi(refMidi, pcs) {
  let best = pcs[0], bd = Infinity;
  for (const pc of pcs) {
    const cand = pc + 12 * Math.round((refMidi - pc) / 12);
    const d = Math.abs(cand - refMidi);
    if (d < bd) { bd = d; best = cand; }
  }
  return best;
}

// Phrase-pool improvised-feel variation: targets chord tones (with an
// occasional chromatic approach note) and leaves real rests between
// phrases, so it reads as grounded improvisation, not a random walk.
function buildVariationEvents(tune, rngFn, density) {
  // Variation choruses breathe even more than the theme: keep a seeded
  // subset of the authored line, drop the rest into silence, and let a
  // few phrases fall an octave into the dark of the horn.
  const keep = 0.45 + density * 0.6;
  const out = [];
  for (const [bar, slot, dur, semis, oct] of tune.melody) {
    if (rngFn() > keep) continue;
    const dropOctave = rngFn() < 0.3;
    out.push([bar, slot, dur, semis, dropOctave ? oct - 1 : oct]);
  }
  // Never an empty chorus: guarantee the opening sigh survives.
  if (!out.length) out.push(tune.melody[0], tune.melody[1]);
  return buildMelodyEventsFromNotes(out);
}

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
  // Venue doors: same landmarks as the marquee swell for now — the located
  // club-door lowpass is a *tight-radius* effect distinct from the wider
  // marquee-glow swell computed in update().
  const doorPts = marqueePts;
  const furnacePts = (plan.landmarks || [])
    .filter((l) => l.kind === 'furnace')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));

  function makeImpulseResponse(ac, seconds, decay) {
    const rate = ac.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ac.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function buildGraph() {
    const audio = getAudio();
    if (!audio) return null;
    const { ctx: ac, master } = audio;

    const jazzBus = ac.createGain();
    jazzBus.gain.value = 0.85;

    // Shared tone shaping: a gentle high shelf stands in for the old
    // always-on 1900Hz lowpass ("through a club door" is now located, below).
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3200;
    shelf.gain.value = -2;

    const doorLP = ac.createBiquadFilter();
    doorLP.type = 'lowpass';
    doorLP.frequency.value = 18000; // wide open by default; swept only near a venue door
    doorLP.Q.value = 0.3;

    jazzBus.connect(shelf);
    shelf.connect(doorLP);

    const dryGain = ac.createGain();
    dryGain.gain.value = 0.62;
    doorLP.connect(dryGain);
    dryGain.connect(master);

    // Room: a tight chamber fed per-instrument, never by the whole bus —
    // a bus-wide send smears brushes and crackle into a constant hiss wash.
    const convolver = ac.createConvolver();
    convolver.buffer = makeImpulseResponse(ac, 0.9, 4.0);
    const wetGain = ac.createGain();
    wetGain.gain.value = 0.14;
    convolver.connect(wetGain);
    wetGain.connect(master);

    const bassBus = ac.createGain(); bassBus.gain.value = 0.42; bassBus.connect(jazzBus);
    const drumBus = ac.createGain(); drumBus.gain.value = 0.4; drumBus.connect(jazzBus);
    const pianoBus = ac.createGain(); pianoBus.gain.value = 0.5; pianoBus.connect(jazzBus);
    const leadBus = ac.createGain(); leadBus.gain.value = 0.95; leadBus.connect(jazzBus);
    const padBus = ac.createGain(); padBus.gain.value = 0.85; padBus.connect(jazzBus);
    const crackleBus = ac.createGain(); crackleBus.gain.value = 0.03; crackleBus.connect(jazzBus);
    const pianoRoom = ac.createGain(); pianoRoom.gain.value = 0.8; pianoBus.connect(pianoRoom); pianoRoom.connect(convolver);
    const leadRoom = ac.createGain(); leadRoom.gain.value = 1.15; leadBus.connect(leadRoom); leadRoom.connect(convolver);
    const drumRoom = ac.createGain(); drumRoom.gain.value = 0.15; drumBus.connect(drumRoom); drumRoom.connect(convolver);
    const padRoom = ac.createGain(); padRoom.gain.value = 0.5; padBus.connect(padRoom); padRoom.connect(convolver);

    // The brush stir: a continuous circular brush-on-snare wash, a looping
    // noise bed breathing at ~0.22 Hz — the signature slow-jazz texture.
    const stirSrc = ac.createBufferSource();
    stirSrc.buffer = makeNoiseBuffer(ac, 2, rng);
    stirSrc.loop = true;
    const stirBP = ac.createBiquadFilter(); stirBP.type = 'bandpass';
    stirBP.frequency.value = 3400; stirBP.Q.value = 0.6;
    const stirGain = ac.createGain(); stirGain.gain.value = 0.016;
    const stirLFO = ac.createOscillator(); stirLFO.frequency.value = 0.22;
    const stirDepth = ac.createGain(); stirDepth.gain.value = 0.009;
    stirLFO.connect(stirDepth); stirDepth.connect(stirGain.gain);
    stirSrc.connect(stirBP); stirBP.connect(stirGain); stirGain.connect(drumBus);
    stirSrc.start(); stirLFO.start();

    const rideBuf = makeNoiseBuffer(ac, 1, rng);
    const snareBuf = makeNoiseBuffer(ac, 1, rng);
    const hatBuf = makeNoiseBuffer(ac, 1, rng);
    const crackleBuf = makeNoiseBuffer(ac, 1, rng);

    return {
      ac, jazzBus, shelf, doorLP, bassBus, drumBus, pianoBus, leadBus, padBus, crackleBus,
      rideBuf, snareBuf, hatBuf, crackleBuf,
    };
  }

  // ---- Upright bass: triangle+sine body, pluck transient (short filtered
  // noise tick), per-note lowpass envelope, real voice leading. ----

  let lastBassMidi = null;

  function pickBassNote(chord, beatInBar, nextChord) {
    const octaves = [chord.bass - 1, chord.bass, chord.bass + 1];
    const candidates = [];
    for (const oct of octaves) for (const iv of chord.tones) candidates.push((oct + 1) * 12 + NOTE_SEMITONE[chord.root] + iv);
    const inRange = candidates.filter((m) => m >= 38 && m <= 57); // roughly D2..A3
    const pool = inRange.length ? inRange : candidates;

    if (lastBassMidi == null) {
      lastBassMidi = (chord.bass + 1) * 12 + NOTE_SEMITONE[chord.root] + chord.tones[0];
      return lastBassMidi;
    }
    if (beatInBar === 3 && nextChord) {
      const nextRoot = nearestTo(lastBassMidi, [
        (chord.bass + 1) * 12 + NOTE_SEMITONE[nextChord.root] + nextChord.tones[0],
        (chord.bass + 2) * 12 + NOTE_SEMITONE[nextChord.root] + nextChord.tones[0],
      ]);
      const dir = nextRoot > lastBassMidi ? 1 : -1;
      const approach = nextRoot - dir; // chromatic approach, half step into the next root
      lastBassMidi = approach;
      return approach;
    }
    if (beatInBar === 0) {
      const rootPc = NOTE_SEMITONE[chord.root];
      const rootCandidates = pool.filter((m) => ((m - rootPc) % 12 + 12) % 12 === 0);
      lastBassMidi = nearestTo(lastBassMidi, rootCandidates.length ? rootCandidates : pool);
      return lastBassMidi;
    }
    // beats 1 & 2: mostly stepwise motion through chord tones, occasional skip
    const stepwise = pool.filter((m) => Math.abs(m - lastBassMidi) > 0 && Math.abs(m - lastBassMidi) <= 2);
    const chosen = stepwise.length && rng() < 0.7
      ? nearestTo(lastBassMidi + (rng() < 0.5 ? -2 : 2), stepwise)
      : nearestTo(lastBassMidi + (rng() < 0.5 ? -4 : 4), pool);
    lastBassMidi = chosen;
    return chosen;
  }

  function pluckBass(freq, t, dur) {
    const { ac, bassBus, snareBuf } = g;
    const o1 = ac.createOscillator(); o1.type = 'sine';
    const o2 = ac.createOscillator(); o2.type = 'triangle';
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq, t);
    const filt = ac.createBiquadFilter(); filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1100, t);
    filt.frequency.exponentialRampToValueAtTime(260, t + dur * 0.75);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.5, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.92);
    o1.connect(gn); o2.connect(gn); gn.connect(filt); filt.connect(bassBus);
    o1.start(t); o2.start(t); o1.stop(t + dur); o2.stop(t + dur);

    // Pluck transient: a short filtered noise tick at the attack.
    const tick = ac.createBufferSource(); tick.buffer = snareBuf;
    tick.playbackRate.value = 3.2 + rng() * 0.6;
    const tickBP = ac.createBiquadFilter(); tickBP.type = 'bandpass';
    tickBP.frequency.value = 260 + rng() * 90; tickBP.Q.value = 3;
    const tickGn = ac.createGain();
    tickGn.gain.setValueAtTime(0.0001, t);
    tickGn.gain.linearRampToValueAtTime(0.1, t + 0.002);
    tickGn.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    tick.connect(tickBP); tickBP.connect(tickGn); tickGn.connect(bassBus);
    tick.start(t); tick.stop(t + 0.04);
  }

  // ---- Piano: percussive stacked-detuned-triangle attack, per-note envelope
  // (not a shared filter), rootless voice-led voicings, varied comping. ----

  let lastVoicing = null;
  let lastCompPattern = null;

  function voiceLeadChord(chord, octaveBase) {
    const pcs = chord.tones.slice(1); // rootless: guide tones + extensions
    if (!lastVoicing) {
      lastVoicing = pcs.map((iv) => (octaveBase + 1) * 12 + (((NOTE_SEMITONE[chord.root] + iv) % 12 + 12) % 12));
      return lastVoicing.slice();
    }
    const used = new Set();
    const result = [];
    for (const iv of pcs) {
      const pc = ((NOTE_SEMITONE[chord.root] + iv) % 12 + 12) % 12;
      let best = null, bd = Infinity;
      for (const oct of [octaveBase - 1, octaveBase, octaveBase + 1]) {
        const midi = (oct + 1) * 12 + pc;
        if (used.has(midi)) continue;
        for (const ref of lastVoicing) {
          const d = Math.abs(midi - ref);
          if (d < bd) { bd = d; best = midi; }
        }
      }
      if (best == null) best = (octaveBase + 1) * 12 + pc;
      used.add(best);
      result.push(best);
    }
    lastVoicing = result;
    return result;
  }

  function pianoNote(freq, t, dur, vel) {
    const { ac, pianoBus } = g;
    const bright = ac.createBiquadFilter(); bright.type = 'lowpass';
    bright.frequency.setValueAtTime(4200, t);
    bright.frequency.exponentialRampToValueAtTime(950, t + 0.16);
    bright.Q.value = 0.7;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(vel, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gn.connect(bright); bright.connect(pianoBus);
    for (const cents of [-6, 0, 5]) {
      const o = ac.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.detune.setValueAtTime(cents, t);
      o.connect(gn);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  function pianoVoicing(freqs, t, dur, vel) {
    for (const f of freqs) pianoNote(f, t, dur, vel);
  }

  function pickCompPattern(density) {
    if (rng() > 0.25 + density * 0.55) return 'layout'; // more layout when density is low (day/late-night)
    const patterns = ['downbeat', 'charleston', 'anticipation', 'backbeat'];
    return patterns[Math.floor(rng() * patterns.length)];
  }

  function humanize() { return (rng() - 0.5) * 0.016 * humanizeScale; } // ±8ms baseline, loosened for the nocturne

  function schedulePianoBar(t, chord, nextChord) {
    let pattern = pickCompPattern(currentDensity);
    if (pattern === lastCompPattern && pattern !== 'layout' && rng() < 0.5) pattern = pickCompPattern(currentDensity);
    lastCompPattern = pattern;
    if (pattern === 'layout') return; // lay out entirely for this bar

    const voicing = voiceLeadChord(chord, 4).map(midiToFreq);
    const vel = 0.1 + rng() * 0.03;

    if (pattern === 'downbeat') {
      pianoVoicing(voicing, t + humanize() * 0.3, BEAT * 0.9, vel);
    } else if (pattern === 'charleston') {
      pianoVoicing(voicing, t, BEAT * 0.4, vel);
      pianoVoicing(voicing, t + BEAT + SWING_UP + humanize(), BEAT * 0.6, vel * 0.85);
    } else if (pattern === 'backbeat') {
      pianoVoicing(voicing, t + BEAT + humanize(), BEAT * 0.55, vel);
      pianoVoicing(voicing, t + 3 * BEAT + humanize(), BEAT * 0.7, vel * 0.9);
    } else if (pattern === 'anticipation') {
      pianoVoicing(voicing, t + 2 * BEAT + humanize(), BEAT * 0.5, vel * 0.8);
      const nextVoicing = (nextChord ? voiceLeadChord(nextChord, 4) : voiceLeadChord(chord, 4)).map(midiToFreq);
      pianoVoicing(nextVoicing, t + 3 * BEAT + SWING_UP + humanize(), BEAT * 0.7, vel);
    }
  }

  // ---- Brushes: ride pattern with correct swing, snare circles/taps on
  // beats 2 and 4, soft hat splashes. ----

  function rideTick(t, accent) {
    const { ac, drumBus, rideBuf } = g;
    const src = ac.createBufferSource(); src.buffer = rideBuf;
    src.playbackRate.value = 2.2 + rng() * 0.4;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 7200; bp.Q.value = 2.2;
    const gn = ac.createGain();
    const peak = accent ? 0.18 : 0.09;
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
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(450, t + 0.18);
    bp.Q.value = 0.8;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.15, t + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(bp); bp.connect(gn); gn.connect(drumBus);
    src.start(t); src.stop(t + 0.3);
  }

  function hatSplash(t) {
    const { ac, drumBus, hatBuf } = g;
    const src = ac.createBufferSource(); src.buffer = hatBuf;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.06, t + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(gn); gn.connect(drumBus);
    src.start(t); src.stop(t + 0.06);
  }

  function crackleTick(t) {
    const { ac, crackleBus, crackleBuf } = g;
    const src = ac.createBufferSource(); src.buffer = crackleBuf;
    src.playbackRate.value = 3 + rng() * 3;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3400;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.006 + rng() * 0.008, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp); hp.connect(gn); gn.connect(crackleBus);
    src.start(t); src.stop(t + 0.05);
  }

  // ---- Muted trumpet: sawtooth through two fixed formant bandpasses
  // (~800Hz, ~1600Hz) in parallel, vibrato that arrives late, fall-offs at
  // phrase ends. ----

  // ---- The sax: the lonely tenor. Sawtooth reed through two formant
  // peaks and a warm lowpass; slow breath attack, a swell in the middle
  // of held notes, vibrato that arrives late and deepens, a drop of
  // breath noise under everything, and portamento into close notes.
  let lastSaxFreq = null;
  let lastSaxEnd = -Infinity;
  function saxNote(freq, t, dur, isPhraseEnd) {
    const { ac, leadBus } = g;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const sub = ac.createOscillator(); sub.type = 'square';
    sub.frequency.setValueAtTime(freq / 2, t);
    const subGain = ac.createGain(); subGain.gain.value = 0.18;

    // Portamento: scoop in from the previous note when the line is legato.
    if (lastSaxFreq && t - lastSaxEnd < 0.35) {
      o.frequency.setValueAtTime(lastSaxFreq, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    } else {
      // A small under-scoop from a semitone below — the reed speaking.
      o.frequency.setValueAtTime(freq * 0.962, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
    }
    lastSaxFreq = freq; lastSaxEnd = t + dur;

    // Late, deepening vibrato.
    const vib = ac.createOscillator(); vib.type = 'sine'; vib.frequency.value = 4.8;
    const vibDepth = ac.createGain();
    const vibDelay = Math.min(dur * 0.45, 0.5);
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.setValueAtTime(0, t + vibDelay);
    vibDepth.gain.linearRampToValueAtTime(freq * 0.008, t + vibDelay + 0.4);
    vibDepth.gain.linearRampToValueAtTime(freq * 0.013, t + Math.max(vibDelay + 0.6, dur));
    vib.connect(vibDepth); vibDepth.connect(o.frequency); vibDepth.connect(sub.frequency);
    vib.start(t); vib.stop(t + dur + 0.4);

    if (isPhraseEnd) {
      o.frequency.setValueAtTime(freq, t + dur * 0.82);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.94), t + dur + 0.25);
    }

    // Breath envelope: slow attack, mid-note swell, long die.
    const amp = ac.createGain();
    const attack = Math.min(0.13, Math.max(0.07, dur * 0.12));
    const peak = 0.42;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(peak * 0.8, t + attack);
    amp.gain.linearRampToValueAtTime(peak * 0.66, t + attack + 0.12);
    amp.gain.linearRampToValueAtTime(peak, t + Math.max(attack + 0.2, dur * 0.6));
    amp.gain.setValueAtTime(peak, t + Math.max(attack + 0.2, dur * 0.86));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + (isPhraseEnd ? 0.4 : 0.18));
    o.connect(amp); sub.connect(subGain); subGain.connect(amp);

    // Breath noise riding the same envelope, quiet.
    const breath = ac.createBufferSource(); breath.buffer = g.rideBuf; breath.loop = true;
    const bbp = ac.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = 1900; bbp.Q.value = 0.8;
    const bGain = ac.createGain(); bGain.gain.value = 0.045;
    breath.connect(bbp); bbp.connect(bGain); bGain.connect(amp);
    breath.start(t); breath.stop(t + dur + 0.4);

    // Sax body: two formants and a dark lowpass, mixed.
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 560; f1.Q.value = 2.6;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1350; f2.Q.value = 3.2;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 0.4;
    const m1 = ac.createGain(); m1.gain.value = 0.62;
    const m2 = ac.createGain(); m2.gain.value = 0.3;
    const m3 = ac.createGain(); m3.gain.value = 0.5;
    amp.connect(f1); f1.connect(m1); m1.connect(leadBus);
    amp.connect(f2); f2.connect(m2); m2.connect(leadBus);
    amp.connect(lp); lp.connect(m3); m3.connect(leadBus);
    o.start(t); o.stop(t + dur + 0.5);
    sub.start(t); sub.stop(t + dur + 0.5);
  }

  // ---- The cushion: a smoky horn-section pad holding each bar's chord,
  // detuned saws through a dark lowpass, swelling in well after the
  // downbeat and breathing away before the next change.
  function padChord(chord, t, barDur) {
    const { ac, padBus } = g;
    const freqs = voiceLeadChord(chord, 3).slice(0, 4);
    for (const fr of freqs) {
      for (const det of [-6, 5]) {
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.value = 780; lp.Q.value = 0.3;
        const amp = ac.createGain();
        const lvl = 0.05;
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.linearRampToValueAtTime(lvl, t + barDur * 0.42);
        amp.gain.setValueAtTime(lvl, t + barDur * 0.72);
        amp.gain.linearRampToValueAtTime(0.0001, t + barDur * 1.04);
        o.connect(lp); lp.connect(amp); amp.connect(padBus);
        o.start(t); o.stop(t + barDur * 1.1);
      }
    }
  }

  const LOOKAHEAD = 0.2;
  let nextBeatTime = 0;
  let beatCount = 0;
  let barIndex = 0;
  let crackleNext = 0;

  // ---- Chorus engine: authored melody choruses alternate with phrase-pool
  // variation choruses; tune/density chosen from day-night phase at each
  // chorus boundary so the switch is never abrupt mid-tune. ----
  let currentTune = null;
  let chorusStartBar = 0;
  let chorusStartTime = 0;
  let chorusType = 'melody';
  let variationStreak = 0;
  let currentDensity = 0.5;
  let humanizeScale = 1;
  let leadQueue = [];
  let leadPtr = 0;

  function startNewChorus(t) {
    const isFirst = !currentTune;
    const mood = pickTune(getDayPhase());
    currentTune = mood.tune;
    currentDensity = mood.density;
    humanizeScale = 1.6; // loose, behind-the-beat noir feel throughout
    chorusStartBar = barIndex;
    chorusStartTime = t;
    if (isFirst) {
      chorusType = 'melody';
      variationStreak = 0;
    } else {
      const next = nextChorusType(chorusType, variationStreak, rng);
      chorusType = next.type;
      variationStreak = next.streak;
    }
    leadQueue = chorusType === 'melody'
      ? withPhraseEnds(buildMelodyEvents(currentTune))
      : withPhraseEnds(buildVariationEvents(currentTune, rng, currentDensity));
    leadPtr = 0;
  }

  function scheduleBeat(t) {
    const beatInBar = beatCount % 4;
    if (beatInBar === 0 && (!currentTune || barIndex - chorusStartBar >= currentTune.bars.length)) {
      startNewChorus(t);
    }
    const localBar = (barIndex - chorusStartBar) % currentTune.bars.length;
    const chord = CHORDS[currentTune.bars[localBar]];
    const nextChord = CHORDS[currentTune.bars[(localBar + 1) % currentTune.bars.length]];

    // Half-time feel: the bass breathes in two, roots and gentle passes.
    if (beatInBar === 0 || beatInBar === 2) {
      const bassMidi = pickBassNote(chord, beatInBar, nextChord);
      pluckBass(midiToFreq(bassMidi), t + (beatInBar === 0 ? 0 : humanize()), BEAT * 1.7);
    }

    if (beatInBar === 0) {
      padChord(chord, t, BEAT * 4);
      // The piano speaks maybe twice a phrase, never comps.
      if (rng() < 0.4) schedulePianoBar(t, chord, nextChord);
    }

    // Brushes: a soft ride tick on each beat, the swung upbeat only
    // sometimes, and the back-beat taps gone — the stir bed carries time.
    rideTick(t, false);
    if (rng() < 0.5) rideTick(t + SWING_UP + humanize(), false);
    if (beatInBar === 3 && rng() < 0.22) brushSnare(t + humanize());
  }

  function scheduleLead(scheduleTo) {
    if (!currentTune) return;
    while (leadPtr < leadQueue.length) {
      const ev = leadQueue[leadPtr];
      const noteT = beatsToTime(chorusStartTime, ev.beats);
      if (noteT >= scheduleTo) break;
      saxNote(ev.freq, noteT + humanize() * 0.5, ev.dur * BEAT * 0.95, ev.phraseEnd);
      leadPtr++;
    }
  }

  function scheduleCrackle(scheduleTo) {
    while (crackleNext < scheduleTo) {
      crackleTick(crackleNext);
      crackleNext += 0.6 + rng() * 2.2; // far sparser than before — felt, not heard
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
    crackleNext = now;
    currentTune = null;
    startNewChorus(now);
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
      const doorMuffle = Math.max(0, 1 - doorD / 18); // tight radius: right outside a venue door

      const targetGain = Math.max(0.15, 0.85 + swell * 0.3 - duck * 0.35);
      g.jazzBus.gain.setTargetAtTime(targetGain, g.ac.currentTime, 1.2);

      const doorCutoff = 18000 - doorMuffle * 16500;
      g.doorLP.frequency.setTargetAtTime(Math.max(1200, doorCutoff), g.ac.currentTime, 0.4);
    },
  };
}
