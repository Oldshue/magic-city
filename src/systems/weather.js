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
 * volume, a filtered-noise rain bed in WebAudio that swells with intensity, occasional distant
 * thunder — a slow-attack low-passed rumble paired with a dim point-light
 * sky-flash — and a faint camera-following vignette quad that desaturates
 * and darkens the whole view while rain is active (a plain transparent
 * quad repositioned every frame to fill the camera's frustum; not a
 * post-processing pass, not a new light).
 *
 * Wet streets: cools and darkens the shared asphalt and lowers its roughness
 * while damp. The 20th Street renderer uses the same wetness and rainfall
 * for pooled standing water and ripples.
 *
 * Overcast: reports an overcast amount to engine/sky.js's setWeatherDim()
 * hook, which pulls the sky's keyframe colors toward grey and softens sun
 * intensity — sky.js owns the actual keyframe math, this only dials it.
 *
 * Verification: this module never parses the page's URL — it stays
 * hermetic. The dev api's setWeather(state) (applied through
 * src/dev-hooks.js's ?weather= convenience, see docs/TECH-CONTRACT.md) is
 * wired straight into setState() below, pinning the state machine to a
 * named state. Degrades silently (visuals only, no sound) when AudioContext
 * is unavailable. Zero allocation inside update() — every scratch object is
 * created once at start.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { setWeatherDim } from '../engine/sky.js';
import { VIEW_EFFECTS_LAYER } from '../engine/renderer.js';
import { underStoreCover } from './rain-shelter.mjs';

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
  const { THREE, scene, camera, materials, storefrontShelters=[] } = ctx;

  // --- seeded state machine, never repeats exactly ----------------------
  // Free-running by default; setState() (the dev api's real hook behind
  // setWeather(), see src/main.js / src/dev-hooks.js) can pin it to a named
  // state for verification.
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

  let forcedState = null; // non-null while pinned via setState()
  let state = CLEAR;
  let stateTimer = dwellFor(CLEAR, rng);

  function advance() {
    if (state === CLEAR) state = OVERCAST;
    else if (state === OVERCAST) state = rng() < 0.78 ? RAIN : CLEAR; // most overcast spells break into rain
    else if (state === RAIN) state = CLEARING;
    else state = CLEAR;
    stateTimer = dwellFor(state, rng);
  }

  /** Pins the state machine to a named state (clear/overcast/rain/clearing),
   * or releases the pin back to free-running when passed a falsy/unknown
   * value. The real hook behind the dev api's setWeather(state).
   * @param {string} [next] */
  function setState(next) {
    if (next === CLEAR || next === OVERCAST || next === RAIN || next === CLEARING) {
      forcedState = next;
      state = next;
      stateTimer = Infinity;
    } else {
      forcedState = null;
      stateTimer = dwellFor(state, rng);
    }
  }

  // --- smoothed effect amounts (state machine drives the targets) -------
  let overcastAmt = 0; // sky dimming: active through overcast/rain/clearing
  let rainAmt = 0;     // rain streaks + rain-bed audio swell + screen vignette
  let wetness = 0;     // street wetness: rises fast, dries slowly
  let cover = 0;
  let runoffTime = 0;

  // --- wet streets: mutate the shared asphalt material in place ---------
  const asphalt = materials && materials.asphalt;
  const dryColor = asphalt ? asphalt.color.clone() : null;
  const dryRoughness = asphalt ? asphalt.roughness : 0;
  const wetColor = new THREE.Color(0x8396ac);

  // --- rain streaks: instanced, camera-relative, recycled ---------------
  // Narrow streaks keep the street and immediate field of view readable in rain.
  const streakGeo = new THREE.BoxGeometry(.012, .90, .012);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xb7c6d6, transparent: true, opacity: 0, depthWrite: false,
  });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, RAIN_COUNT);
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streaks.frustumCulled = false;
  streaks.count = 0;
  streaks.layers.set(VIEW_EFFECTS_LAYER);
  streaks.name='Street rain';
  scene.add(streaks);
  const dropsPerAwning = 13;
  const runoff = storefrontShelters.length ? new THREE.InstancedMesh(
    new THREE.BoxGeometry(.010,.26,.010),streakMat,storefrontShelters.length*dropsPerAwning,
  ) : null;
  if (runoff) {
    runoff.name='Awning runoff';
    runoff.layers.set(VIEW_EFFECTS_LAYER);
    runoff.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    runoff.frustumCulled=false;
    runoff.count=0;
    scene.add(runoff);
  }
  const hiddenStreak=new THREE.Matrix4().makeScale(0,0,0);

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

  // --- scene-wide rain vignette: a camera-following transparent quad -----
  // Not a light, not a post-process pass: a single plane repositioned and
  // rescaled every frame to exactly fill the camera frustum at a fixed
  // depth, alpha-blended over the world. Cool, slightly desaturating tint
  // that fades in with rainAmt and reads as overcast downpour gloom.
  const vignetteTex = makeVignetteTexture(THREE);
  const vignetteMat = new THREE.MeshBasicMaterial({
    map: vignetteTex, color: 0x171b22, transparent: true, opacity: 0,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), vignetteMat);
  vignette.name='Rain veil';
  vignette.layers.set(VIEW_EFFECTS_LAYER);
  vignette.renderOrder = 999;
  vignette.frustumCulled = false;
  scene.add(vignette);
  const _vForward = new THREE.Vector3();
  const VIGNETTE_DIST = 2.2;

  // --- thunder flash: a self-contained dim point light --------------------
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

    nodes = { ac, bus, rainGain, rainFilter, thunderFilter, thunderGain };
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
      if (!forcedState) {
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
        asphalt.color.copy(dryColor).lerp(wetColor, wetness * .44);
        asphalt.roughness = dryRoughness + (.37 - dryRoughness) * wetness;
      }

      // --- rain streak particles -------------------------------------------
      const sheltered=underStoreCover(storefrontShelters,camera.position.x,camera.position.y,camera.position.z);
      cover=THREE.MathUtils.damp(cover,sheltered ? 1 : 0,5,dt);
      streakMat.opacity = rainAmt * .48;
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
          if (underStoreCover(storefrontShelters,_pos.x,_pos.y-.42,_pos.z)) {
            streaks.setMatrixAt(i,hiddenStreak);
          } else {
            _m.compose(_pos, _q, _s);
            streaks.setMatrixAt(i, _m);
          }
        }
        streaks.instanceMatrix.needsUpdate = true;
      } else {
        streaks.count = 0;
      }

      if (runoff) {
        runoff.count=rainAmt>.09 ? storefrontShelters.length*dropsPerAwning : 0;
        if (runoff.count) {
          runoffTime+=dt;
          for (let i=0; i<runoff.count; i++) {
            const awning=storefrontShelters[Math.floor(i/dropsPerAwning)];
            const location=(i%dropsPerAwning+.53)/dropsPerAwning-.5;
            const fall=runoffTime*(1.22+.17*(i%4))+i*.381966;
            const age=fall-Math.floor(fall);
            const z=awning.z+location*(2*awning.halfWidth-.12);
            const y=awning.eaveY-.13-(awning.eaveY-.45)*age*age;
            _m.makeTranslation(awning.eaveX-awning.side*(.042+age*.045),y,z);
            runoff.setMatrixAt(i,_m);
          }
          runoff.instanceMatrix.needsUpdate=true;
        }
      }

      // --- scene-wide rain vignette: reposition + rescale to fill frustum --
      if (rainAmt > 0.005) {
        _vForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        vignette.position.copy(camera.position).addScaledVector(_vForward, VIGNETTE_DIST);
        vignette.quaternion.copy(camera.quaternion);
        const vFov = THREE.MathUtils.degToRad(camera.fov || 70);
        const h = 2 * Math.tan(vFov / 2) * VIGNETTE_DIST * 1.04;
        const w = h * (camera.aspect || 1);
        vignette.scale.set(w, h, 1);
        vignetteMat.opacity = rainAmt * .29 * (1 - .65*cover);
      } else {
        vignetteMat.opacity = 0;
      }

      // --- audio: rain bed swell + occasional distant thunder --------------
      if (nodes) {
        const gain=rainAmt>.02 ? (.03+rainAmt*.33)*(1-.67*cover) : 0;
        nodes.rainGain.gain.setTargetAtTime(gain,nodes.ac.currentTime,.34);
        nodes.rainFilter.frequency.setTargetAtTime(1400-470*cover,nodes.ac.currentTime,.46);
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
    setState,
    get wetness() { return wetness; },
    get rainfall() { return rainAmt; },
  };
}

/** Soft radial-vignette texture (darker at edges, faint even at center) used
 * by the scene-wide rain overlay quad. */
function makeVignetteTexture(THREE) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const c2d = canvas.getContext('2d');
  const grad = c2d.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, 'rgba(20,24,32,0.55)');
  grad.addColorStop(0.55, 'rgba(14,17,23,0.75)');
  grad.addColorStop(1, 'rgba(8,10,14,0.95)');
  c2d.fillStyle = grad;
  c2d.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
