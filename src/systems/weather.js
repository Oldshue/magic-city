/**
 * weather.js — noir weather for Magic City 1929: a seeded state machine
 * (clear → overcast → rain → clearing) with slow randomized transitions,
 * a camera-relative instanced rain-streak field, wet-street material
 * response, overcast sky dimming via engine/sky.js's setWeatherDim hook,
 * and a WebAudio rain bed + occasional thunder with a dim sky-flash.
 * Degrades silently without AudioContext; allocation-free per frame.
 *
 * Verification: ?weather=rain pins the state to full rain.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { setWeatherDim } from '../engine/sky.js';

const RAIN_MAX_COUNT = 1500;
const RAIN_BOX_XZ = 26;      // half-extent (m) of the camera-relative rain volume
const RAIN_TOP_Y = 30;       // streak spawn height (m) above the camera
const RAIN_SPAN_Y = 42;      // vertical wrap span (m) — recycled, never runs out
const RAIN_FALL_SPEED = 16;  // m/s base fall speed
const WIND_TILT = 0.16;      // rad, constant wind lean on the streaks

const STATES = { CLEAR: 'clear', OVERCAST: 'overcast', RAIN: 'rain', CLEARING: 'clearing' };

/**
 * @param {object} ctx — systems context (see docs/TECH-CONTRACT.md)
 * @returns {{update(dt:number, elapsed:number): void}}
 */
export function startWeather(ctx) {
  const { THREE, scene, camera, materials } = ctx;

  // Seeded RNG: deterministic mulberry32 stream (see jazz.js/ambience.js for
  // the same pattern) — durations keep drawing fresh values forever, so the
  // weather sequence never repeats exactly, unlike the sky's fixed cycle.
  const rng = makeRng(192907);

  // --- ?weather=rain verification pin ---------------------------------
  let pinnedRain = false;
  try {
    pinnedRain = new URLSearchParams(window.location.search).get('weather') === 'rain';
  } catch (_) { /* no location/URLSearchParams in this environment */ }

  // --- state machine -----------------------------------------------------
  let state = STATES.CLEAR;
  let stateT = 0;
  let stateDur = clearDuration();
  let overcastAmount = 0; // 0..1, eased
  let rainAmount = 0;     // 0..1, eased — drives streak density + audio swell
  let wetness = 0;        // 0..1, lags rainAmount — drives the street material

  function clearDuration() { return (2 + rng() * 3) * 360; }   // 720–1800s: a few day-cycles
  function overcastDuration() { return 30 + rng() * 70; }      // 30–100s cloud build-up
  function rainDuration() { return 60 + rng() * 60; }          // 60–120s, per spec
  function clearingDuration() { return 45 + rng() * 60; }      // 45–105s taper back to clear

  function enter(next) {
    state = next;
    stateT = 0;
    if (next === STATES.CLEAR) stateDur = clearDuration();
    else if (next === STATES.OVERCAST) stateDur = overcastDuration();
    else if (next === STATES.RAIN) stateDur = rainDuration();
    else stateDur = clearingDuration();
  }

  // --- wet streets: mutate the shared asphalt material in place, never
  // clone. Originals captured once so we can always restore exactly. ------
  const asphalt = materials.asphalt;
  const dryColor = new THREE.Color(asphalt.color.getHex());
  const wetColor = new THREE.Color(0x14161a);
  const dryRoughness = asphalt.roughness;
  const dryMetalness = asphalt.metalness;

  // --- rain streak field: one InstancedMesh, camera-relative, recycled ---
  const streakGeo = new THREE.PlaneGeometry(0.035, 1);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xcdd7e2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const rainMesh = new THREE.InstancedMesh(streakGeo, streakMat, RAIN_MAX_COUNT);
  rainMesh.count = 0;
  rainMesh.frustumCulled = false; // camera-relative cloud of tiny quads; skip bad auto-bounds
  scene.add(rainMesh);

  const streaks = new Array(RAIN_MAX_COUNT);
  for (let i = 0; i < RAIN_MAX_COUNT; i++) {
    const x = (rng() - 0.5) * RAIN_BOX_XZ * 2;
    const z = (rng() - 0.5) * RAIN_BOX_XZ * 2;
    streaks[i] = {
      x, z,
      // Camera sits at the exact center of the box each frame, so the
      // direction from a streak to the camera is always -offset: precompute
      // the billboard yaw once instead of an atan2 per streak per frame.
      faceAngle: Math.atan2(-x, -z),
      phase: rng() * RAIN_SPAN_Y,
      speedMul: 0.8 + rng() * 0.5,
      lenMul: 0.7 + rng() * 0.7,
      tilt: WIND_TILT + (rng() - 0.5) * 0.05,
    };
  }
  const dummy = new THREE.Object3D();

  // --- dim sky-flash for distant thunder (own light, sky.js untouched) ---
  const flash = new THREE.HemisphereLight(0xdfe6ef, 0x1a1c22, 0);
  scene.add(flash);
  let flashT = -1; // <0 = idle
  let nextThunder = 12 + rng() * 18;

  // --- WebAudio: rain bed (filtered noise, swells with intensity) + ------
  // occasional thunder (low filtered rumble, slow attack). Silent no-op
  // until the shared bus unlocks; never throws if AudioContext is absent.
  let nodes = null;
  function init() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;

    const bus = ac.createGain();
    bus.gain.value = 1;
    bus.connect(master);

    const bedSrc = ac.createBufferSource();
    bedSrc.buffer = makeNoiseBuffer(ac, 4, rng);
    bedSrc.loop = true;
    const bedBand = ac.createBiquadFilter();
    bedBand.type = 'bandpass';
    bedBand.frequency.value = 3200;
    bedBand.Q.value = 0.5;
    const bedLP = ac.createBiquadFilter();
    bedLP.type = 'lowpass';
    bedLP.frequency.value = 4200;
    const bedGain = ac.createGain();
    bedGain.gain.value = 0.0001;
    bedSrc.connect(bedBand);
    bedBand.connect(bedLP);
    bedLP.connect(bedGain);
    bedGain.connect(bus);
    bedSrc.start();

    const thunderFilter = ac.createBiquadFilter();
    thunderFilter.type = 'lowpass';
    thunderFilter.frequency.value = 220;
    thunderFilter.connect(bus);

    nodes = { ac, bus, bedGain, thunderFilter };
  }
  onReady(init);

  function playThunder(strength) {
    if (!nodes) return;
    const { ac, thunderFilter } = nodes;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer(ac, 2.5, rng);
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 2.2);
    const g = ac.createGain();
    const peak = 0.18 * strength;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.9); // slow attack — distant rumble, not a crack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4 + rng() * 1.2);
    src.connect(g);
    osc.connect(g);
    g.connect(thunderFilter);
    src.start(t);
    osc.start(t);
    src.stop(t + 4.8);
    osc.stop(t + 4.8);
  }

  return {
    /**
     * @param {number} dt
     * @param {number} elapsed
     */
    update(dt, elapsed) {
      // --- advance the state machine ----------------------------------
      if (pinnedRain) {
        state = STATES.RAIN;
      } else {
        stateT += dt;
        if (stateT >= stateDur) {
          if (state === STATES.CLEAR) enter(STATES.OVERCAST);
          else if (state === STATES.OVERCAST) enter(STATES.RAIN);
          else if (state === STATES.RAIN) enter(STATES.CLEARING);
          else enter(STATES.CLEAR);
        }
      }

      // --- targets per state, eased toward slowly ----------------------
      let overcastTarget = 0;
      let rainTarget = 0;
      if (state === STATES.OVERCAST) { overcastTarget = 1; }
      else if (state === STATES.RAIN) { overcastTarget = 1; rainTarget = 1; }
      else if (state === STATES.CLEARING) { overcastTarget = 0.35; }

      overcastAmount += (overcastTarget - overcastAmount) * (1 - Math.exp(-dt / 5));
      rainAmount += (rainTarget - rainAmount) * (1 - Math.exp(-dt / 3));
      if (overcastAmount < 0.001) overcastAmount = 0;
      if (rainAmount < 0.001) rainAmount = 0;

      if (rainAmount > 0.08) {
        wetness += (1 - wetness) * (1 - Math.exp(-dt / 6));   // wets quickly
      } else {
        wetness += (0 - wetness) * (1 - Math.exp(-dt / 70));  // dries slowly
      }
      if (wetness < 0.001) wetness = 0;

      // --- overcast: soften sun/hemi + pull sky grey via sky.js hook ----
      setWeatherDim(1 - overcastAmount * 0.62);

      // --- wet streets: darken asphalt, drop roughness / lift metalness
      // so lamp light and marquee glow streak on the road at night. Same
      // shared material object throughout — no per-frame clone. ----------
      asphalt.color.copy(dryColor).lerp(wetColor, wetness * 0.72);
      asphalt.roughness = dryRoughness - wetness * 0.55;
      asphalt.metalness = dryMetalness + wetness * 0.12;

      // --- rain streak field, camera-relative and recycled --------------
      const visible = rainAmount > 0.02;
      rainMesh.visible = visible;
      if (visible) {
        const count = Math.max(80, Math.floor(RAIN_MAX_COUNT * rainAmount));
        rainMesh.count = count;
        streakMat.opacity = 0.15 + rainAmount * 0.45;
        const camX = camera.position.x;
        const camY = camera.position.y;
        const camZ = camera.position.z;
        const lenBase = 0.6 + rainAmount * 0.7;
        for (let i = 0; i < count; i++) {
          const s = streaks[i];
          const fall = elapsed * RAIN_FALL_SPEED * s.speedMul + s.phase;
          const wrapped = ((fall % RAIN_SPAN_Y) + RAIN_SPAN_Y) % RAIN_SPAN_Y;
          dummy.position.set(camX + s.x, camY + RAIN_TOP_Y - wrapped, camZ + s.z);
          dummy.rotation.set(0, s.faceAngle, s.tilt);
          dummy.scale.set(1, lenBase * s.lenMul, 1);
          dummy.updateMatrix();
          rainMesh.setMatrixAt(i, dummy.matrix);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      }

      // --- occasional distant thunder + dim sky-flash --------------------
      if (state === STATES.RAIN && rainAmount > 0.4) {
        nextThunder -= dt;
        if (nextThunder <= 0) {
          nextThunder = 10 + rng() * 22;
          playThunder(0.5 + rainAmount * 0.5);
          flashT = 0;
        }
      }
      if (flashT >= 0) {
        flashT += dt;
        const flashDur = 0.5;
        const k = Math.max(0, 1 - flashT / flashDur);
        flash.intensity = k * k * 0.55;
        if (flashT > flashDur) flashT = -1;
      } else if (flash.intensity !== 0) {
        flash.intensity = 0;
      }

      // --- rain bed swell --------------------------------------------------
      if (nodes) {
        const targetBed = 0.0001 + rainAmount * 0.5;
        nodes.bedGain.gain.setTargetAtTime(targetBed, nodes.ac.currentTime, 1.5);
      }
    },
  };
}
