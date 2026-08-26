/**
 * main.js — boot sequence for Magic City 1929.
 *
 * Loads data/city-plan.json, builds the ground plane and street ribbons,
 * dynamically imports each district module (skipping missing ones), starts
 * systems/narrative if present, and runs the frame loop.
 *
 * Verification hooks (see docs/TECH-CONTRACT.md "Verification hooks"):
 *   ?phase=0.42        pins the day-night cycle phase (0..1); elapsed fed to
 *                       the sky system is forced to phase * 360 every frame.
 *   ?pos=x,z&yaw=deg    overrides the plan spawn position/yaw.
 *   ?fly=1              multiplies movement speed 6x (via a scaled dt fed to
 *                       controls.update) and enables R (up) / F (down) keys,
 *                       handled entirely in this module.
 *   window.__MC          exposed once boot completes: { scene, camera, plan,
 *                       getDayPhase, drawCalls }.
 */
import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { createControls, EYE_HEIGHT } from './engine/controls.js';
import { createSky } from './engine/sky.js';
import { materials } from './engine/materials.js';
import * as deco from './engine/deco.js';

const DAY_NIGHT_CYCLE_SECONDS = 360;
const FLY_SPEED_MULTIPLIER = 6;
const FLY_VERTICAL_SPEED = 25.2; // m/s (base walk speed 4.2 * 6, matches the horizontal multiplier)
const FLY_MIN_Y = 0.3; // floor so flying never dips the camera below the ground plane

async function boot() {
  const { renderer, scene, camera } = createRenderer();
  const plan = await fetch('data/city-plan.json').then((r) => r.json());

  // --- Verification query params (parsed once, outside the frame loop) ---
  const qs = new URLSearchParams(window.location.search);
  const phaseOverride = qs.has('phase') ? parseFloat(qs.get('phase')) : null;
  const hasPhaseOverride = phaseOverride !== null && Number.isFinite(phaseOverride);
  const flyMode = qs.get('fly') === '1';

  let spawnPos = plan.spawn.position;
  let spawnYaw = plan.spawn.yawDeg;
  if (qs.has('pos')) {
    const parts = qs.get('pos').split(',').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) spawnPos = parts;
  }
  if (qs.has('yaw')) {
    const yawOverride = parseFloat(qs.get('yaw'));
    if (Number.isFinite(yawOverride)) spawnYaw = yawOverride;
  }

  const sky = createSky(scene, scene.fog);
  const controls = createControls(camera, document.body, plan.bounds);
  controls.setSpawn(spawnPos, spawnYaw);

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
  const ctx = {
    THREE, scene, camera, renderer, plan,
    materials, deco, registerInteractive,
    getDayPhase: sky.getDayPhase,
    interactives,
  };

  // --- Districts (dynamic import, skip missing) -----------------------
  for (const d of plan.districts) {
    try {
      const mod = await import('./districts/' + d.slug + '.js');
      await mod.build({ ...ctx, district: d });
      console.info('[magic-city] built district:', d.slug);
    } catch (err) {
      console.warn('[magic-city] skipping district', d.slug, err && err.message);
    }
  }

  // --- Systems & narrative (optional modules) --------------------------
  let systemsUpdate = null;
  try {
    const sys = await import('./systems/index.js');
    systemsUpdate = sys.startSystems(ctx).update;
  } catch (_) { /* no systems yet */ }
  try {
    const nar = await import('./narrative/index.js');
    nar.initNarrative(ctx);
  } catch (_) { /* no narrative yet */ }

  // Fade out the loading title once the world is ready.
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('done');

  // --- Fly mode: R (up) / F (down) keys, handled entirely here --------
  // A persistent altitude offset added on top of whatever controls.js sets
  // for camera.position.y each frame (controls.js owns eye-height + head-bob).
  let flyAltitude = 0;
  const flyKeys = Object.create(null);
  if (flyMode) {
    document.addEventListener('keydown', (e) => { flyKeys[e.code] = true; });
    document.addEventListener('keyup', (e) => { flyKeys[e.code] = false; });
  }

  // --- window.__MC verification hook, exposed once boot completes ------
  window.__MC = {
    scene,
    camera,
    plan,
    getDayPhase: sky.getDayPhase,
    drawCalls: () => renderer.info.render.calls,
  };

  // --- Frame loop ------------------------------------------------------
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);

    // ?fly=1 multiplies movement speed 6x by scaling the dt fed to
    // controls.update (movement in controls.js is speed * dt), the only
    // per-frame lever available without editing controls.js.
    controls.update(flyMode ? dt * FLY_SPEED_MULTIPLIER : dt);

    if (flyMode) {
      if (flyKeys['KeyR']) flyAltitude += dt * FLY_VERTICAL_SPEED;
      if (flyKeys['KeyF']) flyAltitude -= dt * FLY_VERTICAL_SPEED;
      if (flyAltitude < FLY_MIN_Y - EYE_HEIGHT) flyAltitude = FLY_MIN_Y - EYE_HEIGHT;
      camera.position.y += flyAltitude;
    }

    // ?phase=0.42 pins the day-night cycle: feed a forced elapsed value
    // (phase * 360) to the sky system every frame instead of clock time.
    const elapsed = hasPhaseOverride ? phaseOverride * DAY_NIGHT_CYCLE_SECONDS : clock.elapsedTime;

    const phase = sky.update(dt, elapsed);
    deco.setLampsNight(phase < 0.22 || phase > 0.8 ? 1 : 0);
    if (systemsUpdate) systemsUpdate(dt, elapsed);
    renderer.render(scene, camera);
  }
  frame();
}

boot().catch((err) => {
  console.error('[magic-city] boot failed:', err);
});
