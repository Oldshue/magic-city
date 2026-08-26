/**
 * ambience.js — WebAudio-synthesized street-level soundscape: low industrial
 * rumble from the furnace district (scaled by proximity and night), faint
 * streetcar bell dings when a car is near, downtown crowd murmur by day, and
 * a distant train horn occasionally at night. No audio files. Silent no-op
 * until the shared audio bus unlocks on first user gesture.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';

export function startAmbience(ctx) {
  const { plan, getDayPhase, camera, THREE } = ctx;
  const furnaces = (plan.landmarks || [])
    .filter((l) => l.kind === 'furnace')
    .map((l) => new THREE.Vector2(l.position[0], l.position[1]));

  const rng = makeRng(20260826);
  let nodes = null;
  let nextDing = 6 + Math.random() * 6;
  let nextHorn = 20 + Math.random() * 20;

  function init() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;

    const bus = ac.createGain();
    bus.gain.value = 0.5;
    bus.connect(master);

    const rumbleOsc = ac.createOscillator();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.value = 48;
    const rumbleNoise = ac.createBufferSource();
    rumbleNoise.buffer = makeNoiseBuffer(ac, 2, rng);
    rumbleNoise.loop = true;
    const rumbleFilter = ac.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 140;
    const rumbleGain = ac.createGain();
    rumbleGain.gain.value = 0.0;
    rumbleOsc.connect(rumbleGain);
    rumbleNoise.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(bus);
    rumbleOsc.start();
    rumbleNoise.start();

    const crowdSrc = ac.createBufferSource();
    crowdSrc.buffer = makeNoiseBuffer(ac, 3, rng);
    crowdSrc.loop = true;
    const crowdFilter = ac.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 550;
    crowdFilter.Q.value = 0.6;
    const crowdGain = ac.createGain();
    crowdGain.gain.value = 0.0;
    crowdSrc.connect(crowdFilter);
    crowdFilter.connect(crowdGain);
    crowdGain.connect(bus);
    crowdSrc.start();

    nodes = { ac, bus, rumbleGain, crowdGain };
  }
  onReady(init);

  function playDing() {
    if (!nodes) return;
    const ac = nodes.ac;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(nodes.bus);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  function playHorn() {
    if (!nodes) return;
    const ac = nodes.ac;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.linearRampToValueAtTime(98, t + 1.6);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(filter);
    filter.connect(g);
    g.connect(nodes.bus);
    osc.start(t);
    osc.stop(t + 1.9);
  }

  const tmp = new THREE.Vector2();
  const tmp2 = new THREE.Vector2();

  return {
    update(dt, elapsed, extra) {
      if (!nodes) return;
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;
      const day = 1 - night;

      tmp.set(camera.position.x, camera.position.z);
      let minD = Infinity;
      for (const f of furnaces) {
        const d = tmp.distanceTo(f);
        if (d < minD) minD = d;
      }
      const furnaceFactor = Math.max(0, 1 - minD / 500);
      const targetRumble = 0.05 + furnaceFactor * 0.55 * (0.6 + 0.4 * night);
      nodes.rumbleGain.gain.setTargetAtTime(targetRumble, nodes.ac.currentTime, 0.8);

      const centerD = Math.hypot(camera.position.x, camera.position.z);
      const downtownFactor = Math.max(0, 1 - centerD / 500);
      const targetCrowd = downtownFactor * 0.18 * (0.35 + 0.65 * day);
      nodes.crowdGain.gain.setTargetAtTime(targetCrowd, nodes.ac.currentTime, 1.0);

      nextDing -= dt;
      if (nextDing <= 0) {
        nextDing = 5 + rng() * 9;
        const carPositions = extra && extra.carPositions;
        if (carPositions && carPositions.length) {
          let nearest = Infinity;
          for (const p of carPositions) {
            tmp2.set(p.x, p.z);
            const d = tmp.distanceTo(tmp2);
            if (d < nearest) nearest = d;
          }
          if (nearest < 140) playDing();
        }
      }

      nextHorn -= dt;
      if (nextHorn <= 0) {
        nextHorn = 22 + rng() * 26;
        if (night) playHorn();
      }
    },
  };
}
