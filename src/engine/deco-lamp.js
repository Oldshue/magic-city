/**
 * deco-lamp.js - the period streetlamp and its PointLight + ground-glow
 * pool.
 * streetlamp() builds a period acorn/bishop-crook fixture: fluted
 * dark-green post, curved bishop-crook arm, bronze crown collar, glass
 * acorn globe - and registers itself in the shared lampRecords pool
 * ({group, globe}) that initLampPool/updateLampPool consume.
 *
 * M3b (Lighting Engineer II - night/dusk street visibility): the
 * point-light pool is now 12 lights (was 8), reassigned each frame to the
 * 12 standards nearest the camera (distance ~22m, decay 2, intensity
 * ramped by night glow) so the street itself reads as lit, not just the
 * globes. Every registered lamp (not just the pooled 12) also gets a soft
 * additive ground-glow disc baked into ONE shared InstancedMesh (radial
 * canvas texture, warm, additive, depthWrite off) built once in
 * initLampPool() after every district has registered its lamps, so the
 * whole city's lamp pools fade in together at zero extra draw-call cost
 * beyond that single instanced mesh. Per-lamp discs are no longer built
 * inside each lamp's own group in streetlamp() - one InstancedMesh
 * replaces what used to be one Mesh per lamp.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { materials } from './materials.js';
import { glowDiscTexture } from './deco-shared.js';

const lampGlobes = [];
const lampRecords = []; // {group, globe} - registered lamps, consumed by initLampPool/updateLampPool

const postGreen = new THREE.MeshStandardMaterial({ color: 0x1e2f22, roughness: 0.45, metalness: 0.55 });

/**
 * streetlamp - period pole lamp with warm globe; globe auto-dims by day.
 * Registers the lamp for the point-light + ground-glow pool (see
 * initLampPool/updateLampPool below) - the pavement glow disc itself is
 * NOT built here; it rides in the single shared InstancedMesh built by
 * initLampPool() once every lamp in the city has been registered.
 * @returns {THREE.Group} base at y=0, ~5m tall
 */
export function streetlamp() {
  const g = new THREE.Group();

  // Fluted cast-iron base plinth.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 8), postGreen);
  base.position.y = 0.175;
  g.add(base);

  // Fluted post (8-sided reads as fluting at street scale).
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 4.1, 8), postGreen);
  pole.position.y = 0.35 + 4.1 / 2;
  g.add(pole);

  // Bronze collar where the crook meets the post.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.18, 8), materials.bronze);
  collar.position.y = 4.45;
  g.add(collar);

  // Bishop-crook arm: curved out and up, approximated with two angled
  // segments (cheap, reads as a curve at street distance).
  const crookA = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), postGreen);
  crookA.position.set(0.18, 4.62, 0);
  crookA.rotation.z = -Math.PI / 3.2;
  g.add(crookA);
  const crookB = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 6), postGreen);
  crookB.position.set(0.5, 4.86, 0);
  crookB.rotation.z = -Math.PI / 8;
  g.add(crookB);

  // Bronze crown ring beneath the globe.
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 10), materials.bronze);
  crown.position.set(0.82, 4.98, 0);
  crown.rotation.x = Math.PI / 2;
  g.add(crown);

  // Glass acorn globe (elongated sphere, flattened base).
  const globeMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), globeMat);
  globe.scale.set(1, 1.25, 1);
  globe.position.set(0.82, 5.16, 0);
  lampGlobes.push(globe);
  g.add(globe);

  lampRecords.push({ group: g, globe });
  return g;
}

/**
 * setLampsNight - toggle all registered lamp globes for night mode. The
 * pavement glow-pool discs (one shared InstancedMesh, see initLampPool)
 * are faded every frame by updateLampPool() instead, since they share one
 * mesh rather than being addressable as per-lamp materials.
 * @param {number} nightFactor 0 (day) .. 1 (night)
 */
export function setLampsNight(nightFactor) {
  const lit = nightFactor > 0.35;
  for (const globe of lampGlobes) {
    globe.material.color.setHex(lit ? 0xffd9a0 : 0x555550);
  }
}

const LAMP_POOL_SIZE = 12; // <=12 real point lights, per the M3b budget
const LAMP_LIGHT_DISTANCE = 22;
const LAMP_LIGHT_DECAY = 2;
const LAMP_LIGHT_PEAK = 9;
let lampPool = null;
let discMesh = null;
const _poolWorldPos = new THREE.Vector3();
const _poolDistScratch = new Float64Array(LAMP_POOL_SIZE);
const _poolNearest = new Array(LAMP_POOL_SIZE).fill(null);
const _discMatrix = new THREE.Matrix4();
const _discQuatI = new THREE.Quaternion();
const _discScale = new THREE.Vector3(1, 1, 1);
const _discOffset = new THREE.Vector3();
const _discWorldPos = new THREE.Vector3();

/**
 * initLampPool - create the recycled pool of streetlamp PointLights (12,
 * reassigned each frame to the nearest standards) and the single shared
 * ground-glow InstancedMesh covering EVERY registered lamp. Call once,
 * after every district has built and registered its lamps via
 * streetlamp() (main.js does this right after the district loop). Safe
 * to call multiple times (no-op after first).
 * @param {THREE.Scene} scene
 * @returns {THREE.PointLight[]}
 */
export function initLampPool(scene) {
  if (lampPool) return lampPool;
  lampPool = [];
  for (let i = 0; i < LAMP_POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xffb870, 0, LAMP_LIGHT_DISTANCE, LAMP_LIGHT_DECAY);
    light.visible = false;
    light.castShadow = false;
    scene.add(light);
    lampPool.push(light);
  }

  // One shared additive ground-glow disc per registered lamp, all in a
  // single InstancedMesh (one draw call regardless of lamp count). Built
  // once here - after every district has registered its lamps - using
  // each lamp's world matrix so it sits correctly under the globe even
  // for lamps nested inside a rotated/offset district group.
  if (lampRecords.length) {
    const discGeo = new THREE.CircleGeometry(4.2, 20);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      map: glowDiscTexture(), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffffff, toneMapped: false,
    });
    discMesh = new THREE.InstancedMesh(discGeo, discMat, lampRecords.length);
    discMesh.userData.noShadow = true;
    for (let i = 0; i < lampRecords.length; i++) {
      const rec = lampRecords[i];
      rec.group.updateWorldMatrix(true, false);
      _discOffset.set(0.82, 0.03, 0);
      _discWorldPos.copy(_discOffset).applyMatrix4(rec.group.matrixWorld);
      _discMatrix.compose(_discWorldPos, _discQuatI, _discScale);
      discMesh.setMatrixAt(i, _discMatrix);
    }
    discMesh.instanceMatrix.needsUpdate = true;
    scene.add(discMesh);
  }

  return lampPool;
}

/**
 * updateLampPool - reassign the recycled PointLight pool (12 lights) to
 * the streetlamps nearest cameraPosition, scaled by nightFactor (0 = all
 * lights off), and fade the shared ground-glow disc InstancedMesh in with
 * the same factor. Call once per frame after initLampPool(scene) has run.
 * @param {{x:number,z:number}} cameraPosition
 * @param {number} nightFactor 0 (day) .. 1 (night)
 */
export function updateLampPool(cameraPosition, nightFactor) {
  if (discMesh) {
    discMesh.material.opacity = nightFactor > 0.3 ? Math.min(1, (nightFactor - 0.3) / 0.4) : 0;
  }
  if (!lampPool || !cameraPosition) return;
  if (nightFactor <= 0.05 || lampRecords.length === 0) {
    for (const l of lampPool) l.visible = false;
    return;
  }
  for (let i = 0; i < LAMP_POOL_SIZE; i++) { _poolDistScratch[i] = Infinity; _poolNearest[i] = null; }
  for (let i = 0; i < lampRecords.length; i++) {
    const rec = lampRecords[i];
    rec.group.getWorldPosition(_poolWorldPos);
    const dx = _poolWorldPos.x - cameraPosition.x;
    const dz = _poolWorldPos.z - cameraPosition.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < _poolDistScratch[LAMP_POOL_SIZE - 1]) {
      let idx = LAMP_POOL_SIZE - 1;
      _poolDistScratch[idx] = d2;
      _poolNearest[idx] = { x: _poolWorldPos.x, z: _poolWorldPos.z };
      while (idx > 0 && _poolDistScratch[idx] < _poolDistScratch[idx - 1]) {
        const dTmp = _poolDistScratch[idx]; _poolDistScratch[idx] = _poolDistScratch[idx - 1]; _poolDistScratch[idx - 1] = dTmp;
        const nTmp = _poolNearest[idx]; _poolNearest[idx] = _poolNearest[idx - 1]; _poolNearest[idx - 1] = nTmp;
        idx--;
      }
    }
  }
  for (let i = 0; i < LAMP_POOL_SIZE; i++) {
    const light = lampPool[i];
    const pos = _poolNearest[i];
    if (pos) {
      light.visible = true;
      light.position.set(pos.x, 4.3, pos.z);
      light.intensity = LAMP_LIGHT_PEAK * nightFactor;
    } else {
      light.visible = false;
    }
  }
}
