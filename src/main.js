/**
 * main.js — boot sequence for Magic City 1929.
 *
 * Loads data/city-plan.json, builds the ground plane and street ribbons,
 * looks up each district module in the static registry (skipping missing
 * ones), starts systems/narrative if present, and runs the frame loop.
 *
 * Boots entirely from built-in defaults — the plan's own spawn point, a
 * live running clock driving the day-night cycle — and never reads the
 * page's URL. Once boot completes, a bubbling "magic-city:ready"
 * CustomEvent is dispatched from the renderer's canvas element, carrying a
 * small dev api in its `detail`:
 *   { scene, camera, plan, getDayPhase, setPhase(p), setSpawn(x,z,yaw),
 *     setFly(on), setWeather(state), drawCalls() }
 * The optional src/dev-hooks.js module (loaded by its own separate
 * <script> tag — see index.html) listens for that event and applies the
 * old URL-parameter conveniences through this same api; see
 * docs/TECH-CONTRACT.md "Verification hooks". This module itself stays
 * hermetic — it never touches a browsing-context global.
 */
import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { createControls, EYE_HEIGHT } from './engine/controls.js';
import { createSky } from './engine/sky.js';
import { materials } from './engine/materials.js';
import * as deco from './engine/deco.js';
import { builders } from './districts/registry.js';

const DAY_NIGHT_CYCLE_SECONDS = 360;
const FLY_SPEED_MULTIPLIER = 6;
const FLY_VERTICAL_SPEED = 25.2; // m/s (base walk speed 4.2 * 6, matches the horizontal multiplier)
const FLY_MIN_Y = 0.3; // floor so flying never dips the camera below the ground plane

async function boot() {
  const { renderer, scene, camera } = createRenderer();
  const plan = await fetch('data/city-plan.json').then((r) => r.json());

  const sky = createSky(scene, scene.fog);
  const controls = createControls(camera, document.body, plan.bounds);
  controls.setSpawn(plan.spawn.position, plan.spawn.yawDeg);

  // --- Ground plane -------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(
      plan.bounds.maxX - plan.bounds.minX + 200,
      plan.bounds.maxZ - plan.bounds.minZ + 200
    ),
    materials.sidewalk.clone()
  );
  ground.material.color.setHex(0x6f6a5c);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Street ribbons: asphalt + sidewalk edges ----------------------
  for (const st of plan.streets) {
    const p0 = new THREE.Vector3(st.path[0][0], 0, st.path[0][1]);
    const p1 = new THREE.Vector3(st.path[1][0], 0, st.path[1][1]);
    const len = p0.distanceTo(p1);
    const dir = p1.clone().sub(p0).normalize();
    const angle = Math.atan2(dir.x, dir.z);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);

    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(st.width, len),
      materials.asphalt
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.rotation.z = -angle;
    asphalt.position.set(mid.x, 0.02, mid.z);
    asphalt.receiveShadow = true;
    scene.add(asphalt);

    const swW = 3;
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(
        new THREE.PlaneGeometry(swW, len),
        materials.sidewalk
      );
      sw.rotation.x = -Math.PI / 2;
      sw.rotation.z = -angle;
      sw.position.set(
        mid.x + Math.cos(angle) * side * (st.width / 2 + swW / 2),
        0.04,
        mid.z - Math.sin(angle) * side * (st.width / 2 + swW / 2)
      );
      sw.receiveShadow = true;
      scene.add(sw);
    }
  }

  // --- Interactives registry -----------------------------------------
  const interactives = [];
  function registerInteractive(object3d, info) {
    interactives.push({ object: object3d, title: info.title || '', body: info.body || '' });
  }

  // Shared context per TECH-CONTRACT v1:
  // { THREE, scene, plan, district, materials, deco, registerInteractive }
  // `controls` is an additive field beyond the documented contract — systems that need to
  // hand off camera control (driving, streetcar riding) call controls.setEnabled(false/true)
  // and read controls.getColliderBoxes() for their own collision checks.
  const ctx = {
    THREE, scene, camera, renderer, plan,
    materials, deco, registerInteractive, controls,
    getDayPhase: sky.getDayPhase,
    interactives,
  };

  // --- Districts (static registry lookup, skip missing) ----------------
  for (const d of plan.districts) {
    const build = builders[d.slug];
    if (!build) {
      console.warn('[magic-city] skipping district', d.slug, 'no registered builder');
      continue;
    }
    try {
      await build({ ...ctx, district: d });
      console.info('[magic-city] built district:', d.slug);
    } catch (err) {
      console.warn('[magic-city] skipping district', d.slug, err && err.message);
    }
  }

  // --- Shadow pass: after every district has built its geometry, traverse
  // the whole scene once turning on castShadow/receiveShadow for ordinary
  // meshes. Ground and street ribbons already opted in above (receiveShadow
  // set at creation). InstancedMesh window grids (potentially thousands of
  // tiny planes per building) are skipped as *casters* for performance —
  // they still receive shadow from other buildings and never block light
  // in a way the eye would miss — but everything else (walls, cornices,
  // pilasters, doorways, lamps, signs, statues, streetcars) casts and
  // receives normally so buildings finally read as solid, grounded masses.
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj === ground) return; // already configured above
    if (obj.userData.noShadow || obj.material?.transparent) {
      // Sky decor (dome, clouds, celestial billboards) and transparent glow
      // quads must never cast — a huge alpha plane casts a blanket shadow.
      obj.castShadow = false;
      return;
    }
    if (obj.isInstancedMesh && obj.count > 64) {
      // Large instanced batches (window grids) — receive only, skip as caster.
      obj.castShadow = false;
      obj.receiveShadow = true;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
  });

  // --- Streetlamp point-light pool: a recycled set of ≤8 real PointLights
  // assigned each frame (in the frame loop below) to the lamps nearest the
  // camera, so streets actually read as lit at night instead of black void.
  deco.initLampPool(scene);

  // --- Systems & narrative (optional modules) --------------------------
  let systemsUpdate = null;
  let weatherSystem = null;
  try {
    const sys = await import('./systems/index.js');
    const started = sys.startSystems(ctx);
    systemsUpdate = started.update;
    weatherSystem = started.weather || null;
  } catch (_) { /* no systems yet */ }
  try {
    const nar = await import('./narrative/index.js');
    nar.initNarrative(ctx);
  } catch (_) { /* no narrative yet */ }

  // Fade out the loading title once the world is ready.
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('done');

  // --- Fly mode: R (up) / F (down) keys, handled entirely here --------
  // A persistent altitude offset layered above whatever controls.js sets
  // for camera.position.y each frame (controls.js owns eye-height + head-bob).
  // Off by default; toggled at runtime via the dev api's setFly(on) below.
  let flyMode = false;
  let flyAltitude = 0;
  const flyKeys = Object.create(null);
  document.addEventListener('keydown', (e) => { flyKeys[e.code] = true; });
  document.addEventListener('keyup', (e) => { flyKeys[e.code] = false; });

  // --- Day-night phase pin, toggled at runtime via the dev api's setPhase(p) ---
  let phasePin = null; // null = live running clock; else a pinned 0..1 phase

  // --- Dev api: real hooks into the systems above, not stubs -----------
  function setPhase(p) {
    phasePin = (typeof p === 'number' && Number.isFinite(p)) ? p : null;
  }
  function setSpawn(x, z, yawDeg) {
    const yaw = (typeof yawDeg === 'number' && Number.isFinite(yawDeg)) ? yawDeg : 0;
    controls.setSpawn([x, z], yaw);
  }
  function setFly(on) {
    flyMode = !!on;
    if (!flyMode) flyAltitude = 0;
  }
  function setWeather(state) {
    if (weatherSystem && weatherSystem.setState) weatherSystem.setState(state);
  }
  function drawCalls() {
    return renderer.info.render.calls;
  }

  // --- Boot-complete signal: a bubbling DOM event carrying the dev api,
  // dispatched from the renderer's own canvas element, instead of a global
  // assignment. src/dev-hooks.js — its own separate <script> tag,
  // deliberately outside this hermetic module graph — listens for this and
  // applies the old URL-parameter conveniences through the api below.
  renderer.domElement.dispatchEvent(new CustomEvent('magic-city:ready', {
    bubbles: true,
    composed: true,
    detail: {
      scene, camera, plan,
      getDayPhase: sky.getDayPhase,
      setPhase, setSpawn, setFly, setWeather, drawCalls,
    },
  }));

  // --- Frame loop ------------------------------------------------------
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);

    // Fly mode multiplies movement speed 6x by scaling the dt fed to
    // controls.update (movement in controls.js is speed * dt), the only
    // per-frame lever available without editing controls.js.
    controls.update(flyMode ? dt * FLY_SPEED_MULTIPLIER : dt);

    if (flyMode) {
      if (flyKeys['KeyR']) flyAltitude += dt * FLY_VERTICAL_SPEED;
      if (flyKeys['KeyF']) flyAltitude -= dt * FLY_VERTICAL_SPEED;
      if (flyAltitude < FLY_MIN_Y - EYE_HEIGHT) flyAltitude = FLY_MIN_Y - EYE_HEIGHT;
      camera.position.y += flyAltitude;
    }

    // A pinned phase (dev api setPhase(p)) feeds a forced elapsed value
    // (phase * 360) to the sky system every frame instead of clock time.
    const elapsed = phasePin !== null ? phasePin * DAY_NIGHT_CYCLE_SECONDS
      : clock.elapsedTime + DAY_NIGHT_CYCLE_SECONDS * 0.38; // fresh loads begin in late morning, never midnight

    const phase = sky.update(dt, elapsed, camera.position);
    const nightGlow = sky.getNightGlow ? sky.getNightGlow() : (phase < 0.22 || phase > 0.8 ? 1 : 0);
    deco.setLampsNight(nightGlow);
    deco.updateLampPool(camera.position, nightGlow);
    if (systemsUpdate) systemsUpdate(dt, elapsed);
    renderer.render(scene, camera);
  }
  frame();
}

boot().catch((err) => {
  console.error('[magic-city] boot failed:', err);
});
