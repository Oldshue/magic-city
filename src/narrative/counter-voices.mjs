import { getAudio } from '../systems/audioBus.js';

const ASSETS = new URL('../../data/art/counter-voices/', import.meta.url);

export function createCounterVoices() {
  const descriptions = fetch(new URL('lip-timings.json', ASSETS))
    .then(response => response.ok ? response.json() : {})
    .catch(() => ({}));
  const recordings = new Map();
  let active;

  function getRecording(kind, line, audio) {
    const filename = kind + '-' + line + '.mp3';
    if (!recordings.has(filename)) {
      recordings.set(filename, fetch(new URL(filename, ASSETS))
        .then(response => {
          if (!response.ok) throw new Error('Unavailable dialogue');
          return response.arrayBuffer();
        })
        .then(bytes => audio.ctx.decodeAudioData(bytes))
        .catch(() => {
          recordings.delete(filename);
          return null;
        }));
    }
    return recordings.get(filename);
  }

  function stop() {
    if (!active) return;
    const { actor, source, gain, audio } = active;
    actor.speech = null;
    active = null;
    if (!source) return;
    const now = audio.ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, .015);
    source.stop(now + .05);
  }

  function play(counter, line) {
    stop();
    const audio = getAudio();
    const cue = {time:0, duration:5, cues:[], actor:counter.actor, audio};
    active = counter.actor.speech = cue;
    descriptions.then(captions => {
      const timing = captions[counter.kind]?.[line];
      if (active !== cue || !timing) return;
      Object.assign(cue, timing);
    });
    if (!audio) return;
    getRecording(counter.kind, line, audio).then(buffer => {
      if (active !== cue || !buffer || audio.ctx.state !== 'running' || cue.time > .43
          || cue.time >= buffer.duration) return;
      const source = audio.ctx.createBufferSource();
      const gain = audio.ctx.createGain();
      gain.gain.value = .86;
      source.buffer = buffer;
      source.connect(gain).connect(audio.master);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start(0, cue.time);
      cue.started = audio.ctx.currentTime - cue.time;
      cue.source = source;
      cue.gain = gain;
      cue.duration = buffer.duration;
    }).catch(() => { /* The subtitle and face movement work without audio. */ });
  }

  return {
    play, stop,
    preload(kind) {
      const audio = getAudio();
      if (audio) descriptions.then(captions => {
        for (const line of Object.keys(captions[kind] || {})) getRecording(kind, line, audio);
      });
      return Boolean(audio);
    },
    update(dt) {
      if (!active) return;
      const { source, audio, started } = active;
      active.time = source ? audio.ctx.currentTime - started : active.time + dt;
      if (active.time >= active.duration) stop();
    },
  };
}
