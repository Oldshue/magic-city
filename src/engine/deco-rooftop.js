/**
 * deco-rooftop.js - rooftop clutter: water tanks on cylindrical legs,
 * chimneys, rooftop bulkheads (stair/elevator penthouses), and radio
 * masts on the tallest towers, scattered by a seeded rng so skylines read
 * as lived-in rather than bare boxes. Each item is a handful of low-poly
 * primitives (well under 200 tris per item); callers should add the
 * returned group once per rooftop (not instanced) since placement,
 * presence and item count vary per building via the seed.
 *
 * facade-v2 (Storefront Director draw-call pass): setbackTower now calls
 * this once per setback shoulder (several times per building), so every
 * multi-part item that shares one material (tank legs+barrel+roof, all
 * chimneys, mast pole+crossbars — each entirely steelDark or entirely
 * brick) is merged via deco-shared's mergeGeometries into ONE mesh / one
 * draw call instead of one call per part. The bulkhead penthouse's stone
 * body and terracotta cap are two different named palette materials, so
 * instead of two textured meshes they are merged into ONE flat vertex-
 * colored mesh (mergeColored) — a deliberate, small, well-lit trim piece
 * where the texture/vertex-color swap is not visually meaningful at the
 * distance these rooftops are seen from, in exchange for another draw
 * call saved per shoulder.
 * @param {object} [opts]
 * @param {number} [opts.width=12] rooftop width (m), clutter kept inboard
 * @param {number} [opts.depth=12] rooftop depth (m)
 * @param {number} [opts.seed] deterministic scatter seed
 * @param {boolean} [opts.mast=false] add a radio mast (tallest towers only)
 * @returns {THREE.Group} origin at roof-deck center, y=0 = deck surface
 */
import * as THREE from 'three';
import { materials } from './materials.js';
import { rand, mergeGeometries, mergeColored } from './deco-shared.js';

const bulkTrimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
const BULK_STONE = new THREE.Color(0xd8c9a0);
const BULK_CAP = new THREE.Color(0xc8965a);

export function rooftopClutter(opts = {}) {
  const { width = 12, depth = 12, seed = Math.round(width * 53 + depth * 17), mast = false } = opts;
  const g = new THREE.Group();
  const rng = rand(seed);
  const halfW = Math.max(0.5, width / 2 - 1), halfD = Math.max(0.5, depth / 2 - 1);

  // Water tank on cylindrical legs - classic Birmingham rooftop silhouette.
  // All parts (legs, barrel, roof cone) share materials.steelDark, so they
  // merge into one mesh at the tank's own local origin, then the whole
  // merged mesh is translated into place on the roof deck.
  if (rng() < 0.7) {
    const legH = 1.5, tankR = Math.min(1.5, width * 0.11);
    const tankParts = [];
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = new THREE.CylinderGeometry(0.06, 0.06, legH, 5);
      leg.translate(lx, legH / 2, lz);
      tankParts.push(leg);
    }
    const barrel = new THREE.CylinderGeometry(tankR, tankR, tankR * 1.5, 10);
    barrel.translate(0, legH + tankR * 0.75, 0);
    tankParts.push(barrel);
    const roof = new THREE.ConeGeometry(tankR * 1.05, tankR * 0.55, 10);
    roof.translate(0, legH + tankR * 1.5 + tankR * 0.27, 0);
    tankParts.push(roof);
    const tankMesh = new THREE.Mesh(mergeGeometries(tankParts), materials.steelDark);
    tankMesh.position.set((rng() * 2 - 1) * halfW * 0.6, 0, (rng() * 2 - 1) * halfD * 0.6);
    g.add(tankMesh);
  }

  // Chimney stacks - all brick, merged into one mesh regardless of count.
  const chimneyCount = 1 + Math.floor(rng() * 2);
  const chimneyParts = [];
  for (let i = 0; i < chimneyCount; i++) {
    const h = 1.1 + rng() * 1.3;
    const chim = new THREE.CylinderGeometry(0.26, 0.32, h, 8);
    chim.translate((rng() * 2 - 1) * halfW * 0.7, h / 2, (rng() * 2 - 1) * halfD * 0.7);
    chimneyParts.push(chim);
  }
  if (chimneyParts.length) {
    g.add(new THREE.Mesh(mergeGeometries(chimneyParts), materials.brick));
  }

  // Rooftop bulkhead (stair/elevator penthouse) with a terracotta-toned
  // cap - body + cap merged into one flat vertex-colored mesh (one draw
  // call) rather than two textured meshes.
  if (rng() < 0.8) {
    const bw = Math.min(width * 0.28, 3.6), bd = Math.min(depth * 0.28, 3.6), bh = 1.7 + rng() * 0.8;
    const bx = (rng() * 2 - 1) * halfW * 0.35, bz = (rng() * 2 - 1) * halfD * 0.35;
    const bodyGeo = new THREE.BoxGeometry(bw, bh, bd);
    bodyGeo.translate(bx, bh / 2, bz);
    const capGeo = new THREE.BoxGeometry(bw + 0.3, 0.2, bd + 0.3);
    capGeo.translate(bx, bh + 0.1, bz);
    const bulkMesh = new THREE.Mesh(
      mergeColored([{ geo: bodyGeo, color: BULK_STONE }, { geo: capGeo, color: BULK_CAP }]),
      bulkTrimMat
    );
    g.add(bulkMesh);
  }

  // Radio mast - reserved for the tallest towers by caller's opts.mast.
  // Pole + crossbars all steelDark, merged into one mesh.
  if (mast) {
    const mastH = 6 + rng() * 4;
    const mastParts = [];
    const pole = new THREE.CylinderGeometry(0.05, 0.09, mastH, 6);
    pole.translate(0, mastH / 2, 0);
    mastParts.push(pole);
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.BoxGeometry(1.2, 0.04, 0.04);
      bar.translate(0, mastH * (0.4 + i * 0.25), 0);
      mastParts.push(bar);
    }
    const mastMesh = new THREE.Mesh(mergeGeometries(mastParts), materials.steelDark);
    mastMesh.userData.noShadow = true;
    g.add(mastMesh);
  }
  return g;
}
