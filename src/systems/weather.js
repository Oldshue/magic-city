/**
 * weather.js — noir weather for Magic City 1929: a slow-cycling state
 * machine (clear -> overcast -> rain -> clearing) that drives three
 * coordinated effects — a camera-relative instanced rain-streak field, a
 * WebAudio rain bed with occasional distant thunder, and wet-street shine
 * on the shared asphalt material — plus a soft sky dim via sky.js's
 * setWeatherDim() hook.
 *
 * export function startWeather(ctx) -> { update(dt, elapsed) }
 * Registers additively through src/systems/index.js per the systems
 * contract in docs/TECH-CONTRACT.md. Degrades silently with no visual/audio
 * cost when AudioContext is unavailable (see audioBus.js). Allocation-free
 * per frame: every vector/matrix/buffer is allocated once at startup and
 * mutated in place; state-target lookups return primitives, not objects.
 *
 * URL hook: ?weather=rain pins the state machine on RAIN for verification
 * (intensity still ramps in smoothly on load; streaks/audio/thunder still
 * run on schedule).
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { setWeatherDim } from '../engine/sky.js';

const CLEAR = 'clear';
const OVERCAST = 'overcast';
const RAIN = 'rain';
const CLEARING = 'clearing';

const STREAK_COUNT = 1500;
const FIELD_RADIUS = 38;  // camera-relative XZ spawn half-extent (m)
const FIELD_HEIGHT = 26;  // spawn height above camera (m)
const FALL_MIN = 16;
const FALL_MAX = 24;

/** Duration (seconds) spent in a state before advancing. Randomized per the
 * seeded rng so a rain spell recurs every few day-cycles but never on a
 * fixed schedule, and each spell lasts 60-120 real seconds. */
function pickDuration(state, rng) {
  switch (state) {
    case CLEAR:    return 210 + rng() * 420; // several minutes of clear skies between spells
    case OVERCAST: return 25 + rng() * 35;   // clouds slowly building
    case RAIN:     return 60 + rng() * 60;   // 60-120s rain spell
    case CLEARING: return 30 + rng() * 40;   // slow dry-out
    default:       return 60;
  }
}
function nextOf(state) {
  switch (state) {
    case CLEAR:    return OVERCAST;
    case OVERCAST: return RAIN;
    case RAIN:     return CLEARING;
    case CLEARING: return CLEAR;
    default:       return CLEAR;
  }
}
// Target dim/rain values smoothed toward every frame for a given state.
// Two primitive-returning lookups (rather than one function returning a
// fresh { dim, rain } object) so the per-frame update loop stays
// allocation-free.
function targetDimOf(state) {
  switch (state) {
    case OVERCAST: return 0.5;
    case RAIN:     return 0.78;
    case CLEARING: return 0.28;
    default:       return 0.0; // CLEAR
  }
}
function targetRainOf(state) {
  return state === RAIN ? 1.0 : 0.0;
}

export function startWeather(ctx) {
  const { THREE, scene, camera, materials } = ctx;

  // --- ?weather=rain verification pin ------------------------------------
  let pinned = false;
  try {
    pinned = new URLSearchParams(window.location.search).get('weather') === 'rain';
  } catch (_) { /* no window.location in this environment */ }

  // --- Seeded RNG: the cadence is structured (mulberry32), but the seed is
  // drawn from wall-clock time so no two sessions replay the same spells. ---
  const rng = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);

  let state = pinned ? RAIN : CLEAR;
  let timeInState = 0;
  let stateDuration = pickDuration(state, rng);
  let dim = 0;     // smoothed sky-dim factor fed to sky.js, 0..1
  let rain = 0;    // smoothed rain amount driving streaks/audio/wetness, 0..1
  let wetness = 0; // lags `rain`; wets fast, dries slowly

  // --- Rain streak field: instanced, camera-relative, recycled ----------
  const geo = new THREE.BoxGeometry(0.03, 1, 0.03);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc7d6e3, transparent: true, opacity: 0, depthWrite: false,
  });
  const rainMesh = new THREE.InstancedMesh(geo, mat, STREAK_COUNT);
  rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  scene.add(rainMesh);

  // Per-streak state packed flat: x, y, z (camera-relative), fallSpeed.
  const streaks = new Float32Array(STREAK_COUNT * 4);
  for (let i = 0; i < STREAK_COUNT; i++) {
    const o = i * 4;
    streaks[o + 0] = (rng() - 0.5) * FIELD_RADIUS * 2;
    streaks[o + 1] = rng() * FIELD_HEIGHT;
    streaks[o + 2] = (rng() - 0.5) * FIELD_RADIUS * 2;
    streaks[o + 3] = FALL_MIN + rng() * (FALL_MAX - FALL_MIN);
  }

  const _windQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.09);
  const _m = new THREE.Matrix4();
  const _s = new THREE.Vector3(1, 1, 1);
  const _pos = new THREE.Vector3();

  // --- Wet asphalt: mutate the shared material in place, never clone ----
  const asphalt = materials && materials.asphalt;
  const dryColor = asphalt ? asphalt.color.clone() : null;
  const wetColor = dryColor ? dryColor.clone().multiplyScalar(0.5) : null;
  const dryRoughness = asphalt ? asphalt.roughness : 0.95;
  const dryMetalness = asphalt ? asphalt.metalness : 0.0;
  const WET_ROUGHNESS = 0.32;
  const WET_METALNESS = 0.1;

  // --- Distant thunder: a dim sky-flash light, reused not reallocated ---
  const flash = new THREE.PointLight(0xd6e2f2, 0, 1000, 1.6);
  flash.position.set(60, 240, -140);
  scene.add(flash);
  let flashActive = false;
  let flashT = 0;
  const FLASH_ATTACK = 0.8;
  const FLASH_TOTAL = 1.6;
  const FLASH_PEAK = 0.55; // dim, not a lightning-bolt strobe

  let nextThunder = 14 + rng() * 22;

  // --- WebAudio: filtered-noise rain bed + occasional thunder rumble ----
  let nodes = null;
  function initAudio() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;

    const bus = ac.createGain();
    bus.gain.value = 1.0;
    bus.connect(master);

    const rainSrc = ac.createBufferSource();
    rainSrc.buffer = makeNoiseBuffer(ac, 4, rng);
    rainSrc.loop = true;
    const bandpass = ac.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 3200;
    bandpass.Q.value = 0.4;
    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 5200;
    const rainGain = ac.createGain();
    rainGain.gain.value = 0.0;
    rainSrc.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(rainGain);
    rainGain.connect(bus);
    rainSrc.start();

    nodes = { ac, bus, rainGain };
  }
  onReady(initAudio);

  /** Fires a thunder rumble (if audio is live) and the sky-flash (always). */
  function playThunder() {
    flashActive = true;
    flashT = 0;
    if (!nodes) return;
    const ac = nodes.ac;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer(ac, 2.6, rng);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 85;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + FLASH_ATTACK); // slow attack
    g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
    src.connect(filter);
    filter.connect(g);
    g.connect(nodes.bus);
    src.start(t);
    src.stop(t + 3.5);
  }

  return {
    update(dt, elapsed) {
      // --- state machine ------------------------------------------------
      timeInState += dt;
      if (!pinned && timeInState >= stateDuration) {
        state = nextOf(state);
        timeInState = 0;
        stateDuration = pickDuration(state, rng);
        if (state === RAIN) nextThunder = 14 + rng() * 22;
      }

      const dimTau = 9;
      const rainTau = state === RAIN ? 5 : 10;
      dim += (targetDimOf(state) - dim) * (1 - Math.exp(-dt / dimTau));
      rain += (targetRainOf(state) - rain) * (1 - Math.exp(-dt / rainTau));
      if (dim < 0.003) dim = 0;
      if (rain < 0.003) rain = 0;

      setWeatherDim(dim);

      // --- wet streets: fast to wet, slow to dry, shared material only --
      const wetTau = rain > wetness ? 3 : 24;
      wetness += (rain - wetness) * (1 - Math.exp(-dt / wetTau));
      if (asphalt && dryColor && wetColor) {
        asphalt.color.copy(dryColor).lerp(wetColor, wetness);
        asphalt.roughness = dryRoughness + (WET_ROUGHNESS - dryRoughness) * wetness;
        asphalt.metalness = dryMetalness + (WET_METALNESS - dryMetalness) * wetness;
      }

      // --- rain streak field: camera-relative, recycled, allocation-free -
      const active = rain > 0.02;
      rainMesh.visible = active;
      mat.opacity = rain * 0.5;
      if (active) {
        const camX = camera.position.x, camY = camera.position.y, camZ = camera.position.z;
        for (let i = 0; i < STREAK_COUNT; i++) {
          const o = i * 4;
          streaks[o + 1] -= streaks[o + 3] * dt;
          if (streaks[o + 1] < -1) {
            streaks[o + 0] = (rng() - 0.5) * FIELD_RADIUS * 2;
            streaks[o + 1] = FIELD_HEIGHT * (0.7 + rng() * 0.3);
            streaks[o + 2] = (rng() - 0.5) * FIELD_RADIUS * 2;
          }
          _s.set(1, 0.9 + (streaks[o + 3] - FALL_MIN) * 0.03, 1);
          _pos.set(camX + streaks[o + 0], camY + streaks[o + 1], camZ + streaks[o + 2]);
          _m.compose(_pos, _windQuat, _s);
          rainMesh.setMatrixAt(i, _m);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      }

      // --- occasional distant thunder, only while it's actually raining --
      if (state === RAIN) {
        nextThunder -= dt;
        if (nextThunder <= 0) {
          nextThunder = 16 + rng() * 26;
          playThunder();
        }
      }

      // --- audio: rain bed swells with intensity (no-op if audio is down) -
      if (nodes) {
        nodes.rainGain.gain.setTargetAtTime(rain * 0.45, nodes.ac.currentTime, 0.8);
      }

      // --- thunder sky-flash: slow attack, quick decay, kept dim ---------
      if (flashActive) {
        flashT += dt;
        let f;
        if (flashT < FLASH_ATTACK) f = flashT / FLASH_ATTACK;
        else f = Math.max(0, 1 - (flashT - FLASH_ATTACK) / (FLASH_TOTAL - FLASH_ATTACK));
        flash.intensity = f * FLASH_PEAK;
        if (flashT >= FLASH_TOTAL) { flashActive = false; flash.intensity = 0; }
      }
    },
  };
}
