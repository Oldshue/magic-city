/** Period cast-iron streetlights and a shared pool of nearby light sources. */
import * as THREE from '../../vendor/three.module.min.js';
import { materials } from './materials.js';

const streetLights = [];
const interiorLights = [];
const lampGlobes = [];
export const lampGlobeMaterial = new THREE.MeshBasicMaterial({ color: 0x777773 });
const globeDay = new THREE.Color(0x777773);
const globeNight = new THREE.Color(0xffd9a0);

const postGreen = new THREE.MeshStandardMaterial({ color: 0x1e2f22, roughness: 0.45, metalness: 0.55 });

/** Period acorn lamp. The returned group has its base at ground level. */
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
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), lampGlobeMaterial);
  globe.scale.set(1, 1.25, 1);
  globe.position.set(0.82, 5.16, 0);
  lampGlobes.push(globe);
  g.add(globe);

  return g;
}

export function setLampsNight(nightFactor) {
  lampGlobeMaterial.color.copy(globeDay).lerp(globeNight, nightFactor);
}

const LAMP_POOL_SIZE = 12;
const LIGHT_RANGE = 36;
const LIGHT_INTENSITY = 380;
const nearest = new Array(LAMP_POOL_SIZE);
const nearestDistances = new Float64Array(LAMP_POOL_SIZE);
let lampPool = null;

/** Register a stationary lamp for the shared point-light pool. */
export function registerLampPosition(x, y, z, {
  color = 0xffba76, reach = LIGHT_RANGE, daytime = 0, nighttime = LIGHT_INTENSITY,
} = {}) {
  const lamp = {position:new THREE.Vector3(x,y,z), color, reach, daytime, nighttime};
  (daytime > 0 ? interiorLights : streetLights).push(lamp);
}

/** Cache the mounted bulbs after all district transforms are in place. */
export function initLampPool(scene) {
  if (lampPool) return lampPool;
  for (const globe of lampGlobes) {
    const position = globe.getWorldPosition(new THREE.Vector3());
    registerLampPosition(position.x,position.y,position.z);
  }
  lampPool = [];
  for (let i = 0; i < LAMP_POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xffba76, 0, LIGHT_RANGE, 2);
    light.visible = false;
    scene.add(light);
    lampPool.push(light);
  }
  return lampPool;
}

function considerLight(source, position, bounded) {
  const dx = source.position.x - position.x;
  const dz = source.position.z - position.z;
  const distance = dx * dx + dz * dz;
  let slot = LAMP_POOL_SIZE - 1;
  if (distance >= nearestDistances[slot] || (bounded && distance > (source.reach*2)**2)) return;
  while (slot > 0 && distance < nearestDistances[slot - 1]) {
    nearest[slot] = nearest[slot - 1];
    nearestDistances[slot] = nearestDistances[slot - 1];
    slot--;
  }
  nearest[slot] = source;
  nearestDistances[slot] = distance;
}

/** Light nearby surfaces from the bulbs themselves. */
export function updateLampPool(cameraPosition, nightFactor) {
  if (!lampPool || !cameraPosition) return;
  const night = nightFactor > .05 ? nightFactor : 0;
  nearest.fill(null);
  nearestDistances.fill(Infinity);
  for (const source of interiorLights) considerLight(source,cameraPosition,true);
  if (night > 0) {
    for (const source of streetLights) considerLight(source,cameraPosition,false);
  }
  for (let i = 0; i < LAMP_POOL_SIZE; i++) {
    const light = lampPool[i];
    const source = nearest[i];
    light.visible = Boolean(source);
    if (source) {
      light.position.copy(source.position);
      light.color.setHex(source.color);
      light.distance = source.reach;
      light.intensity = source.daytime + (source.nighttime - source.daytime)*night;
    }
  }
}
