/**
 * controls.js — first-person walking controls (PointerLockControls based,
 * with drag-to-look and on-screen joystick fallbacks) with AABB collision
 * against ctx-provided boxes and a subtle walking head-bob.
 *
 * Pointer lock is attempted on click but is always optional: iPads, iframes,
 * and browsers that deny/lack the Pointer Lock API still get a fully playable
 * camera via two fallbacks wired up here (both allocation-free per frame):
 *   - Mouse/touch drag-to-look: pointerdown+move directly rotates the camera
 *     (Euler YXZ, pitch clamped) whenever pointer lock isn't held. Ignores
 *     gestures that start on narrative UI chrome (anything under
 *     #mc-narrative-root) so it never fights the title card, readable panel,
 *     map overlay, or the on-screen joystick/buttons.
 *   - setVirtualMove(x, z): a normalized [-1,1] movement vector the on-screen
 *     joystick (src/narrative/index.js) feeds in every pointermove; it's
 *     summed with WASD input each frame in update().
 *
 * addColliders(boxes) registers {minX,maxX,minZ,maxZ} footprints (buildings,
 * blocks, props). Movement is axis-separated so the player slides along walls
 * instead of sticking. All per-frame work is allocation-free.
 *
 * setEnabled(false)/setEnabled(true) additionally lets other systems (driving,
 * streetcar riding) take over the camera: while disabled, update() is a no-op
 * so this module never fights whoever else is writing camera.position/rotation.
 * getColliderBoxes() additively exposes the raw (unpadded) registered boxes so
 * other systems can do their own radius padding (e.g. a car body vs. a player).
 */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const EYE_HEIGHT = 1.7;
const WALK = 6.5; // m/s — brisk city stride; Shift sprints
const SPRINT = 16.8; // m/s — a real dash for covering blocks
const PLAYER_RADIUS = 0.45; // body radius for collision padding
const BOB_FREQ = 1.7; // bob cycles per second at walk speed
const BOB_AMP = 0.05; // meters of head-bob at full walk speed
const LOOK_SENSITIVITY = 0.0025; // radians/px — mouse drag-to-look fallback
const TOUCH_LOOK_SENSITIVITY = 0.0032; // radians/px — one-finger drag-to-look
const PITCH_LIMIT = Math.PI / 2 - 0.01; // mirrors PointerLockControls' own clamp

/**
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds plan bounds for clamping
 */
export function createControls(camera, domElement, bounds) {
  const controls = new PointerLockControls(camera, domElement);

  const keys = Object.create(null);
  const onKeyDown = (e) => { keys[e.code] = true; };
  const onKeyUp = (e) => { keys[e.code] = false; };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Click anywhere to *attempt* pointer lock — always optional (see module docs).
  // Never throws out to the caller: some browsers (iframes without the
  // allow-pointer-lock permission, some tablets) reject/deny this outright.
  const onClick = () => {
    try { controls.lock(); } catch (_) { /* denied/unavailable — fallbacks below take over */ }
  };
  domElement.addEventListener('click', onClick);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  let enabled = true;

  // --- Fallback drag-to-look (mouse or touch) when pointer lock isn't held ---
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let dragging = false;
  let dragPointerId = null;
  let lastX = 0;
  let lastY = 0;

  /** True if `target` sits inside the narrative overlay chrome (title card,
   * HUD buttons, joystick, readable panel, map) — drag-to-look ignores any
   * gesture that starts there so it never fights that UI.
   * @param {EventTarget} target */
  function isNarrativeUi(target) {
    return !!(target && target.closest && target.closest('#mc-narrative-root'));
  }

  function onPointerDown(e) {
    if (!enabled || controls.isLocked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isNarrativeUi(e.target)) return;
    dragging = true;
    dragPointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerMove(e) {
    if (!dragging || e.pointerId !== dragPointerId) return;
    if (!enabled || controls.isLocked) { dragging = false; return; }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const sensitivity = e.pointerType === 'touch' ? TOUCH_LOOK_SENSITIVITY : LOOK_SENSITIVITY;
    lookEuler.setFromQuaternion(camera.quaternion);
    lookEuler.y -= dx * sensitivity;
    lookEuler.x -= dy * sensitivity;
    lookEuler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, lookEuler.x));
    camera.quaternion.setFromEuler(lookEuler);
  }
  function onPointerUp(e) {
    if (e.pointerId === dragPointerId) { dragging = false; dragPointerId = null; }
  }
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);

  // --- On-screen joystick input (fed by the narrative layer's touch controls) ---
  // Normalized [-1,1] vector, summed with WASD every frame in update(); reset to
  // (0,0) on release. Same two numbers mutated in place — never reallocated.
  const virtualMove = { x: 0, z: 0 };
  /** @param {number} x strafe, -1 (left) .. 1 (right) @param {number} z -1 (forward) .. 1 (back) */
  function setVirtualMove(x, z) { virtualMove.x = x; virtualMove.z = z; }

  /** Register collision boxes. Accepts {minX,maxX,minZ,maxZ} objects.
   * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} boxes */
  function addColliders(boxes) {
    if (!boxes) return;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      rawBoxes.push(b);
      colliders.push(b.minX - PLAYER_RADIUS, b.maxX + PLAYER_RADIUS,
                     b.minZ - PLAYER_RADIUS, b.maxZ + PLAYER_RADIUS);
    }
  }
  // Flat array of [minX, maxX, minZ, maxZ] quads — cache-friendly, allocation-free scans.
  const colliders = [];
  // Unpadded {minX,maxX,minZ,maxZ} boxes, same registration order as `colliders` — exposed via
  // getColliderBoxes() so other systems (e.g. driving.js) can apply their own padding.
  const rawBoxes = [];

  let bobPhase = 0;

  /** True if point (x,z), padded by the player radius, falls inside any collider box. */
  function hitsBox(x, z) {
    for (let i = 0; i < colliders.length; i += 4) {
      if (x > colliders[i] && x < colliders[i + 1] && z > colliders[i + 2] && z < colliders[i + 3]) return true;
    }
    return false;
  }

  /** Per-frame movement update. No-op while disabled (see setEnabled).
   * Movement works identically whether pointer lock is held (keys steer,
   * PointerLockControls owns look) or not (keys + the on-screen joystick
   * steer via virtualMove, drag-to-look owns look above) — movement used to
   * be gated on `controls.isLocked`, which is exactly the bug that stranded
   * players who never got pointer lock.
   * @param {number} dt seconds */
  function update(dt) {
    if (!enabled) return;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    // Blend in the on-screen joystick (touch/no-pointer-lock fallback); a
    // harmless no-op sum whenever it's centered at (0,0).
    ix += virtualMove.x;
    iz += virtualMove.z;
    if (ix > 1) ix = 1; else if (ix < -1) ix = -1;
    if (iz > 1) iz = 1; else if (iz < -1) iz = -1;

    const moving = (ix !== 0 || iz !== 0);

    if (moving) {
      const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
      const speed = sprinting ? SPRINT : WALK;
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();

      let dx = forward.x * -iz + right.x * ix;
      let dz = forward.z * -iz + right.z * ix;
      const len = Math.hypot(dx, dz) || 1;
      dx = dx / len * speed * dt;
      dz = dz / len * speed * dt;

      // Axis-separated AABB rejection: try X, then Z, so we slide along walls.
      const px = camera.position.x + dx;
      if (!hitsBox(px, camera.position.z)) {
        camera.position.x = THREE.MathUtils.clamp(px, bounds.minX, bounds.maxX);
      }
      const pz = camera.position.z + dz;
      if (!hitsBox(camera.position.x, pz)) {
        camera.position.z = THREE.MathUtils.clamp(pz, bounds.minZ, bounds.maxZ);
      }
    }

    // Head-bob: subtle sinusoidal rise tied to travel speed, easing to rest when stopped.
    const speedRatio = moving ? ((keys['ShiftLeft'] || keys['ShiftRight']) ? SPRINT / WALK : 1) : 0;
    bobPhase += dt * BOB_FREQ * Math.PI * 2 * speedRatio;
    camera.position.y = EYE_HEIGHT + Math.sin(bobPhase) * BOB_AMP * speedRatio;
  }

  /** Set spawn position/yaw from the plan. @param {[number,number]} pos @param {number} yawDeg */
  function setSpawn(pos, yawDeg) {
    camera.position.set(pos[0], EYE_HEIGHT, pos[1]);
    camera.rotation.set(0, THREE.MathUtils.degToRad(yawDeg), 0);
  }

  /** Enable/disable the WASD walking-movement update. Driving and streetcar-riding
   * systems call setEnabled(false) to take over the camera, and setEnabled(true) to
   * hand it back on exit.
   * @param {boolean} v */
  function setEnabled(v) { enabled = v; }

  /** Read-only reference to the raw, unpadded collider boxes registered via addColliders —
   * for systems that need their own collision padding (e.g. car-sized instead of player-sized).
   * @returns {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} */
  function getColliderBoxes() { return rawBoxes; }

  return { controls, update, setSpawn, addColliders, setEnabled, getColliderBoxes, setVirtualMove,
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      domElement.removeEventListener('click', onClick);
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointercancel', onPointerUp);
      controls.dispose();
    }
  };
}
