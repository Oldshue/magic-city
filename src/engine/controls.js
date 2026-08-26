/**
 * controls.js — first-person walking controls (PointerLockControls based).
 */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const EYE_HEIGHT = 1.7;
const WALK = 4.2; // m/s
const SPRINT = 8.5; // m/s

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

  /** Per-frame movement update.
   * @param {number} dt seconds */
  function update(dt) {
    if (!controls.isLocked) return;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    if (ix === 0 && iz === 0) return;

    const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? SPRINT : WALK;
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();

    let dx = (forward.x * -iz + right.x * ix);
    let dz = (forward.z * -iz + right.z * ix);
    const len = Math.hypot(dx, dz) || 1;
    dx = dx / len * speed * dt;
    dz = dz / len * speed * dt;

    camera.position.x = THREE.MathUtils.clamp(camera.position.x + dx, bounds.minX, bounds.maxX);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + dz, bounds.minZ, bounds.maxZ);
  }

  /** Set spawn position/yaw from the plan. @param {[number,number]} pos @param {number} yawDeg */
  function setSpawn(pos, yawDeg) {
    camera.position.set(pos[0], EYE_HEIGHT, pos[1]);
    camera.rotation.set(0, THREE.MathUtils.degToRad(yawDeg), 0);
  }

  return { controls, update, setSpawn,
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      domElement.removeEventListener('click', onClick);
      controls.dispose();
    }
  };
}
