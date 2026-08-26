/**
 * weather.js — noir weather for Magic City 1929.
 *
 * A seeded state machine drifts clear -> overcast -> rain -> clearing and
 * back, with slow randomized dwell times (a rain spell roughly every couple
 * of day-night cycles, lasting 60-120 real seconds) — driven by a mulberry32
 * PRNG re-seeded from Date.now() so the sequence never repeats exactly
 * across sessions and never loops within one.
 *
 * Rain: ~1500 instanced streak particles recycled inside a camera-relative
 * volume (never runs dry no matter how far the player walks), a filtered-
 * noise rain bed in WebAudio that swells with intensity, and occasional
 * distant thunder — a slow-attack low-passed rumble paired with a dim
 * point-light sky-flash.
 *
 * Wet streets: gently darkens/glosses the shared materials.asphalt in place
 * (never cloned) while it rains and for a while after, so lamp and marquee
 * light streaks on the road at night; restored as it dries.
 *
 * Overcast: reports an overcast amount to engine/sky.js's setWeatherDim()
 * hook, which pulls the sky's keyframe colors toward grey and softens sun
 * intensity — sky.js owns the actual keyframe math, this only dials it.
 *
 * Verification: ?weather=rain pins the state machine to steady rain.
 * Degrades silently (visuals only, no sound) when AudioContext is
 * unavailable. Zero allocation inside update() — every scratch object is
 * created once at start.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { setWeatherDim } from '../engine/sky.js';

const RAIN_COUNT = 1500;
const RAIN_RADIUS = 42;   // horizontal half-extent of the streak volume around the camera
const RAIN_HEIGHT = 26;   // vertical span of the streak volume above the recycle floor
const RAIN_FALL_SPEED = 24; // m/s
const WIND_SLANT = 2.4;     // horizontal fall drift baked into streak tilt, not per-frame motion

const CLEAR = 'clear';
const OVERCAST = 'overcast';
const RAIN = 'rain';
const CLEARING = 'clearing';

export function startWeather(ctx) {
  const { THREE, scene, camera, materials } = ctx;

  // --- seeded state machine, never repeats exactly ----------------------
  const qs = new URLSearchParams(window.location.search);
  const pinned = qs.get('weather') === 'rain';
  const rng = makeRng((Date.now() ^ 0x4d431929) >>> 0);

  function dwellFor(s, r) {
    switch (s) {
      case CLEAR: return 400 + r() * 800;     // ~1-3 day-night cycles between spells
      case OVERCAST: return 40 + r() * 70;    // clouds building before a spell breaks
      case RAIN: return 60 + r() * 60;        // 60-120s per spec
      case CLEARING: return 30 + r() * 40;    // skies breaking, streets still wet
      default: return 60;
    }
  }

  let state = pinned ? RAIN : CLEAR;
  let stateTimer = pinned ? Infinity : dwellFor(CLEAR, rng);

  function advance() {
    if (state === CLEAR) state = OVERCAST;
    else if (state === OVERCAST) state = rng() < 0.78 ? RAIN : CLEAR; // most overcast spells break into rain
    else if (state === RAIN) state = CLEARING;
    else state = CLEAR;
    stateTimer = dwellFor(state, rng);
  }

  // --- smoothed effect amounts (state machine drives the targets) -------
  let overcastAmt = pinned ? 1 : 0; // sky dimming: active through overcast/rain/clearing
  let rainAmt = pinned ? 1 : 0;     // rain streaks + rain-bed audio swell
  let wetness = pinned ? 1 : 0;     // street wetness: rises fast, dries slowly

  // --- wet streets: mutate the shared asphalt material in place ---------
  const asphalt = materials && materials.asphalt;
  const dryColor = asphalt ? asphalt.color.clone() : null;
  const dryRoughness = asphalt ? asphalt.roughness : 0;
  const dryMetalness = asphalt ? asphalt.metalness : 0;
  const _wetColor = new THREE.Color(0x14161a);

  // --- rain streaks: instanced, camera-relative, recycled ---------------
  const streakGeo = new THREE.BoxGeometry(0.02, 0.6, 0.02);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xb7c6d6, transparent: true, opacity: 0, depthWrite: false,
  });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, RAIN_COUNT);
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streaks.frustumCulled = false;
  streaks.count = 0;
  scene.add(streaks);

  const offX = new Float32Array(RAIN_COUNT);
  const offY = new Float32Array(RAIN_COUNT);
  const offZ = new Float32Array(RAIN_COUNT);
  const fallVar = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i++) {
    offX[i] = (rng() * 2 - 1) * RAIN_RADIUS;
    offY[i] = rng() * RAIN_HEIGHT;
    offZ[i] = (rng() * 2 - 1) * RAIN_RADIUS;
    fallVar[i] = 0.8 + rng() * 0.4;
  }

  const _m = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, -Math.atan2(WIND_SLANT, RAIN_FALL_SPEED))
  );

  // --- thunder flash: a self-contained dim point light -------------------
  const flash = new THREE.PointLight(0xaad0ff, 0, 3000, 2);
  flash.position.set(-150, 380, -300);
  scene.add(flash);
  let flashAge = -1; // -1 = inactive

  // --- WebAudio: rain bed + thunder, degrades silently --------------------
  let nodes = null;
  const rngAudio = makeRng(((Date.now() >>> 2) ^ 0x1929) >>> 0);
  let nextThunder = 18 + rngAudio() * 30;

  function init() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;

    const bus = ac.createGain();
    bus.gain.value = 1;
    bus.connect(master);

    const rainSrc = ac.createBufferSource();
    rainSrc.buffer = makeNoiseBuffer(ac, 3, rngAudio);
    rainSrc.loop = true;
    const rainFilter = ac.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 2400;
    rainFilter.Q.value = 0.5;
    const rainGain = ac.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(bus);
    rainSrc.start();

    const thunderFilter = ac.createBiquadFilter();
    thunderFilter.type = 'lowpass';
    thunderFilter.frequency.value = 140;
    const thunderGain = ac.createGain();
    thunderGain.gain.value = 0.0001;
    thunderFilter.connect(thunderGain);
    thunderGain.connect(bus);

    nodes = { ac, bus, rainGain, thunderFilter, thunderGain };
  }
  onReady(init);

  function playThunder() {
    if (!nodes) return;
    const { ac, thunderFilter, thunderGain } = nodes;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer(ac, 2.4, rngAudio);
    src.connect(thunderFilter);
    const g = thunderGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(0.32, t + 1.5); // slow attack — distant rumble building
    g.exponentialRampToValueAtTime(0.0001, t + 4.8);
    src.start(t);
    src.stop(t + 5);
  }

  return {
    update(dt) {
      // --- state machine ---------------------------------------------------
      if (!pinned) {
        stateTimer -= dt;
        if (stateTimer <= 0) advance();
      }

      const overcastTarget = state === CLEAR ? 0 : 1;
      const rainTarget = state === RAIN ? 1 : state === CLEARING ? 0.25 : 0;
      const wetTarget = state === RAIN || state === CLEARING ? 1 : 0;

      overcastAmt += (overcastTarget - overcastAmt) * Math.min(1, dt * 0.2);
      rainAmt += (rainTarget - rainAmt) * Math.min(1, dt * (rainTarget > rainAmt ? 0.5 : 0.3));
      wetness += (wetTarget - wetness) * Math.min(1, dt * (wetTarget > wetness ? 0.3 : 0.02));

      // --- overcast sky dimming --------------------------------------------
      setWeatherDim(overcastAmt);

      // --- wet streets: mutate the shared asphalt material in place -------
      if (asphalt && dryColor) {
        asphalt.color.copy(dryColor).lerp(_wetColor, wetness * 0.8);
        asphalt.roughness = dryRoughness + (0.15 - dryRoughness) * wetness;
        asphalt.metalness = dryMetalness + 0.15 * wetness;
      }

      // --- rain streak particles -------------------------------------------
      streakMat.opacity = rainAmt * 0.55;
      if (rainAmt > 0.01) {
        streaks.count = RAIN_COUNT;
        const camX = camera.position.x;
        const camY = camera.position.y;
        const camZ = camera.position.z;
        const fall = RAIN_FALL_SPEED * dt;
        for (let i = 0; i < RAIN_COUNT; i++) {
          offY[i] -= fall * fallVar[i];
          if (offY[i] < -2) {
            offY[i] += RAIN_HEIGHT;
            offX[i] = (rng() * 2 - 1) * RAIN_RADIUS;
            offZ[i] = (rng() * 2 - 1) * RAIN_RADIUS;
          }
          _pos.set(camX + offX[i], camY + offY[i], camZ + offZ[i]);
          _m.compose(_pos, _q, _s);
          streaks.setMatrixAt(i, _m);
        }
        streaks.instanceMatrix.needsUpdate = true;
      } else {
        streaks.count = 0;
      }

      // --- audio: rain bed swell + occasional distant thunder --------------
      if (nodes) {
        nodes.rainGain.gain.setTargetAtTime(0.04 + rainAmt * 0.32, nodes.ac.currentTime, 0.7);
      }
      if (state === RAIN || state === CLEARING) {
        nextThunder -= dt;
        if (nextThunder <= 0) {
          nextThunder = 14 + rngAudio() * 32;
          playThunder();
          flashAge = 0;
        }
      }

      // --- thunder sky-flash (dim, brief) -----------------------------------
      if (flashAge >= 0) {
        flashAge += dt;
        let f = 0;
        if (flashAge < 0.15) f = flashAge / 0.15;
        else if (flashAge < 0.22) f = 1;
        else if (flashAge < 1.2) f = 1 - (flashAge - 0.22) / 0.98;
        else { flashAge = -1; f = 0; }
        flash.intensity = f * 0.5;
      }
    },
  };
}
