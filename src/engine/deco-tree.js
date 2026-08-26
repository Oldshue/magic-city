/**
 * deco-tree.js - tree(): a low-poly street/park tree so districts stop
 * improvising green spheres on sticks. One merged mesh per tree (tapered
 * trunk + 3-5 jittered overlapping foliage lobes) with baked per-part
 * vertex color (brown trunk, lighter sunlit foliage, darker under-canopy
 * tone), drawn with a single MeshStandardMaterial({ vertexColors: true })
 * so a whole tree - however many lobes - costs exactly one draw call.
 * Budget: an icosahedron(detail 0) lobe is 20 triangles; 3-5 lobes plus a
 * 6-sided tapered trunk cylinder (~20 tris incl. caps) lands well under
 * the ~250 triangle target even at 5 lobes.
 *
 * Districts pick this helper up in their own passes (per facade-v2 scope,
 * this module does not place any trees itself).
 */
import * as THREE from 'three';
import { rand, mergeColored } from './deco-shared.js';

let _treeMat = null;
function treeMaterial() {
  if (_treeMat) return _treeMat;
  _treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
  return _treeMat;
}

const TRUNK_COLOR = new THREE.Color(0x4a3a26);
const FOLIAGE_LIT = new THREE.Color(0x5c8a42);
const FOLIAGE_DARK = new THREE.Color(0x2c4a24);

/**
 * tree - low-poly deco-era street/park tree.
 * @param {object} [opts]
 * @param {number} [opts.height=6] overall tree height (m)
 * @param {number} [opts.seed] deterministic seed for trunk lean + canopy shape
 * @returns {THREE.Mesh} one merged, vertex-colored mesh; base at y=0
 */
export function tree(opts = {}) {
  const { height = 6, seed = Math.round(height * 733) || 1 } = opts;
  const rng = rand(seed);
  const parts = [];

  // Tapered trunk, slightly leaned for a hand-placed (not stamped) look.
  const trunkH = height * 0.42;
  const lean = (rng() - 0.5) * 0.12;
  const trunkGeo = new THREE.CylinderGeometry(height * 0.022, height * 0.05, trunkH, 6);
  trunkGeo.translate(0, trunkH / 2, 0);
  trunkGeo.rotateZ(lean);
  parts.push({ geo: trunkGeo, color: TRUNK_COLOR });

  // 3-5 jittered, overlapping foliage lobes scattered around the crown.
  const lobeCount = 3 + Math.floor(rng() * 3);
  const canopyBaseY = trunkH * 0.88;
  const canopyR = height * 0.3;
  for (let i = 0; i < lobeCount; i++) {
    const a = (i / lobeCount) * Math.PI * 2 + rng() * 0.7;
    const r = canopyR * (0.3 + rng() * 0.45);
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    const ly = canopyBaseY + height * (0.12 + rng() * 0.34);
    const lobeR = canopyR * (0.55 + rng() * 0.4);
    const geo = new THREE.IcosahedronGeometry(lobeR, 0);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const jitter = 1 + (rng() - 0.5) * 0.3;
      pos.setXYZ(v, pos.getX(v) * jitter, pos.getY(v) * jitter * 0.92, pos.getZ(v) * jitter);
    }
    geo.computeVertexNormals();
    geo.translate(lx, ly, lz);
    const isUnder = ly < canopyBaseY + height * 0.22;
    parts.push({ geo, color: isUnder ? FOLIAGE_DARK : FOLIAGE_LIT });
  }

  const merged = mergeColored(parts);
  const mesh = new THREE.Mesh(merged, treeMaterial());
  return mesh;
}
