/**
 * deco-rooftop.js - rooftop clutter: water tanks on cylindrical legs,
 * chimneys, rooftop bulkheads (stair/elevator penthouses), and radio
 * masts on the tallest towers, scattered by a seeded rng so skylines read
 * as lived-in rather than bare boxes. Each item is a handful of low-poly
 * primitives (well under 200 tris per item); callers should add the
 * returned group once per rooftop (not instanced) since placement,
 * presence and item count vary per building via the seed.
 * @param {object} [opts]
 * @param {number} [opts.width=12] rooftop width (m), clutter kept inboard
 * @param {number} [opts.depth=12] rooftop depth (m)
 * @param {number} [opts.seed] deterministic scatter seed
 * @param {boolean} [opts.mast=false] add a radio mast (tallest towers only)
 * @returns {THREE.Group} origin at roof-deck center, y=0 = deck surface
 */
import * as THREE from 'three';
import { materials } from './materials.js';
import { rand } from './deco-shared.js';

export function rooftopClutter(opts = {}) {
  const { width = 12, depth = 12, seed = Math.round(width * 53 + depth * 17), mast = false } = opts;
  const g = new THREE.Group();
  const rng = rand(seed);
  const halfW = Math.max(0.5, width / 2 - 1), halfD = Math.max(0.5, depth / 2 - 1);

  // Water tank on cylindrical legs - classic Birmingham rooftop silhouette.
  if (rng() < 0.7) {
    const tank = new THREE.Group();
    const legH = 1.5, tankR = Math.min(1.5, width * 0.11);
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, legH, 5);
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = new THREE.Mesh(legGeo, materials.steelDark);
      leg.position.set(lx, legH / 2, lz);
      tank.add(leg);
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR, tankR * 1.5, 10), materials.steelDark);
    barrel.position.y = legH + tankR * 0.75;
    tank.add(barrel);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(tankR * 1.05, tankR * 0.55, 10), materials.steelDark);
    roof.position.y = legH + tankR * 1.5 + tankR * 0.27;
    tank.add(roof);
    tank.position.set((rng() * 2 - 1) * halfW * 0.6, 0, (rng() * 2 - 1) * halfD * 0.6);
    g.add(tank);
  }

  // Chimney stacks.
  const chimneyCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < chimneyCount; i++) {
    const h = 1.1 + rng() * 1.3;
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, h, 8), materials.brick);
    chim.position.set((rng() * 2 - 1) * halfW * 0.7, h / 2, (rng() * 2 - 1) * halfD * 0.7);
    g.add(chim);
  }

  // Rooftop bulkhead (stair/elevator penthouse) with a terracotta cap.
  if (rng() < 0.8) {
    const bw = Math.min(width * 0.28, 3.6), bd = Math.min(depth * 0.28, 3.6), bh = 1.7 + rng() * 0.8;
    const bx = (rng() * 2 - 1) * halfW * 0.35, bz = (rng() * 2 - 1) * halfD * 0.35;
    const bulk = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), materials.limestone);
    bulk.position.set(bx, bh / 2, bz);
    g.add(bulk);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, 0.2, bd + 0.3), materials.terracotta);
    cap.position.set(bx, bh + 0.1, bz);
    g.add(cap);
  }

  // Radio mast - reserved for the tallest towers by caller's opts.mast.
  if (mast) {
    const mastH = 6 + rng() * 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, mastH, 6), materials.steelDark);
    pole.position.set(0, mastH / 2, 0);
    pole.userData.noShadow = true;
    g.add(pole);
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.04), materials.steelDark);
      bar.position.set(0, mastH * (0.4 + i * 0.25), 0);
      bar.userData.noShadow = true;
      g.add(bar);
    }
  }
  return g;
}
