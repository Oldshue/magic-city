/**
 * controls.js — first-person walking controls (PointerLockControls based)
 * with AABB collision against ctx-provided boxes and a subtle walking head-bob.
 *
 * addColliders(boxes) registers {minX,maxX,minZ,maxZ} footprints (buildings,
 * blocks, props). Movement is axis-separated so the player slides along walls
 * instead of sticking. All per-frame work is allocation-free.
 */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const EYE_HEIGHT = 1.7;
const WALK = 4.2; // m/s
const SPRINT = 8.5; // m/s
const PLAYER_RADIUS = 0.45; // body radius for collision padding
const BOB_FREQ = 1.7; // bob cycles per second at walk speed
const BOB_AMP = 0.05; // meters of head-bob at full walk speed

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

  // Click anywhere to lock.
  const onClick = () => controls.lock();
  domElement.addEventListener('click', onClick);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  /** Register collision boxes. Accepts {minX,maxX,minZ,maxZ} objects.
   * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} boxes */
  function addColliders(boxes) {
    if (!boxes) return;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      colliders.push(b.minX - PLAYER_RADIUS, b.maxX + PLAYER_RADIUS,
                     b.minZ - PLAYER_RADIUS, b.maxZ + PLAYER_RADIUS);
    }
  }
  // Flat array of [minX, maxX, minZ, maxZ] quads — cache-friendly, allocation-free scans.
  const colliders = [];

  let bobPhase = 0;

  /** True if point (x,z), padded by the player radius, falls inside any collider box. */
  function hitsBox(x, z) {
    for (let i = 0; i < colliders.length; i += 4) {
      if (x > colliders[i] && x < colliders[i + 1] && z > colliders[i + 2] && z < colliders[i + 3]) return true;
    }
    return false;
  }

  /** Per-frame movement update.
   * @param {number} dt seconds */
  function update(dt) {
    if (!controls.isLocked) return;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;

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

  return { controls, update, setSpawn, addColliders,
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      domElement.removeEventListener('click', onClick);
      controls.dispose();
    }
  };
}
