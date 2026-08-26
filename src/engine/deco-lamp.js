/**
 * deco-lamp.js - the period streetlamp and its PointLight pool.
 * streetlamp() now builds a period acorn/bishop-crook fixture: fluted
 * dark-green post, curved bishop-crook arm, bronze crown collar, glass
 * acorn globe - while keeping the exact same registered lampRecords pool
 * contract ({group, globe, disc}) that initLampPool/updateLampPool and
 * narrative code depend on.
 */
import * as THREE from 'three';
import { materials } from './materials.js';
import { glowDiscTexture } from './deco-shared.js';

const lampGlobes = [];
const lampRecords = [];

const postGreen = new THREE.MeshStandardMaterial({ color: 0x1e2f22, roughness: 0.45, metalness: 0.55 });

/**
 * streetlamp - period pole lamp with warm globe; globes auto-dim by day.
 * Lays a warm glow-pool disc on the pavement beneath the lamp and
 * registers the lamp for the point-light pool (see initLampPool/
 * updateLampPool below).
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

  // Ground glow-pool disc, laid flat, additively blended, invisible by day.
  const discMat = new THREE.MeshBasicMaterial({
    map: glowDiscTexture(), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffffff,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0.82, 0.03, 0);
  g.add(disc);

  lampRecords.push({ group: g, globe, disc });
  return g;
}

/**
 * setLampsNight - toggle all registered lamp globes (and their pavement
 * glow-pool discs) for night mode.
 * @param {number} nightFactor 0 (day) .. 1 (night)
 */
export function setLampsNight(nightFactor) {
  const lit = nightFactor > 0.35;
  for (const globe of lampGlobes) {
    globe.material.color.setHex(lit ? 0xffd9a0 : 0x555550);
  }
  for (const rec of lampRecords) {
    rec.disc.material.opacity = lit ? Math.min(1, (nightFactor - 0.35) / 0.4) : 0;
  }
}

const LAMP_POOL_SIZE = 8;
let lampPool = null;
const _poolWorldPos = new THREE.Vector3();
const _poolDistScratch = new Float64Array(LAMP_POOL_SIZE);
const _poolNearest = new Array(LAMP_POOL_SIZE).fill(null);

/**
 * initLampPool - create the recycled pool of streetlamp PointLights and add
 * them to the scene once. Safe to call multiple times (no-op after first).
 * @param {THREE.Scene} scene
 * @returns {THREE.PointLight[]}
 */
export function initLampPool(scene) {
  if (lampPool) return lampPool;
  lampPool = [];
  for (let i = 0; i < LAMP_POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xffb870, 0, 11, 2);
    light.visible = false;
    scene.add(light);
    lampPool.push(light);
  }
  return lampPool;
}

/**
 * updateLampPool - reassign the recycled PointLight pool to the streetlamps
 * nearest cameraPosition, scaled by nightFactor (0 = all lights off). Call
 * once per frame after initLampPool(scene) has run.
 * @param {{x:number,z:number}} cameraPosition
 * @param {number} nightFactor 0 (day) .. 1 (night)
 */
export function updateLampPool(cameraPosition, nightFactor) {
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
      light.intensity = 7 * nightFactor;
    } else {
      light.visible = false;
    }
  }
}
