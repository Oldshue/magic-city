/**
 * deco.js — art deco geometry helper library for Magic City 1929.
 *
 * v2 (Facade Director pass): windows are real recessed units (dark reveal,
 * glass set into the wall, projecting sill/lintel, mullions) instead of
 * flat quads; ground floors get real storefronts; cornices step; roofs
 * carry mechanical clutter; the streetlamp reads as a period acorn/
 * bishop-crook fixture; new street-furniture helpers are exported. Every
 * previously exported signature keeps working — upgrades are internal or
 * additive-option only, per docs/TECH-CONTRACT.md.
 */
import * as THREE from 'three';
import { materials } from './materials.js';

const lampGlobes = []; // registered by streetlamp(); toggled at night
const lampRecords = []; // {group, globe, disc} — full lamp records for the point-light pool

// ---------------------------------------------------------------------
// Small deterministic PRNG (mulberry32) — stable per-building variation
// across reloads without touching Math.random().
// ---------------------------------------------------------------------
function rand(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _windowGridCalls = 0;

// ---------------------------------------------------------------------
// Tiny local geometry merge (no external addons — tech contract only
// vendors three core + PointerLockControls). Combines several small
// BufferGeometries (already positioned via .translate()/.rotate*()) into
// one indexed geometry with a per-part vertex color, so a whole cluster of
// small ornament (sill+lintel+mullions, or a stepped cornice) draws in one
// InstancedMesh/Mesh call instead of one call per part.
// ---------------------------------------------------------------------
function mergeColored(parts) {
  let vertCount = 0, idxCount = 0;
  for (const p of parts) { vertCount += p.geo.attributes.position.count; idxCount += p.geo.index.count; }
  const position = new Float32Array(vertCount * 3);
  const normal = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const color = new Float32Array(vertCount * 3);
  const IndexArray = idxCount > 65535 ? Uint32Array : Uint16Array;
  const index = new IndexArray(idxCount);
  let vOff = 0, iOff = 0;
  for (const p of parts) {
    const g = p.geo;
    position.set(g.attributes.position.array, vOff * 3);
    normal.set(g.attributes.normal.array, vOff * 3);
    const srcUv = g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2);
    uv.set(srcUv, vOff * 2);
    const n = g.attributes.position.count;
    const c = p.color;
    for (let i = 0; i < n; i++) {
      color[(vOff + i) * 3] = c.r; color[(vOff + i) * 3 + 1] = c.g; color[(vOff + i) * 3 + 2] = c.b;
    }
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) index[iOff + i] = idx[i] + vOff;
    vOff += n; iOff += idx.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

// Shared vertex-colored material for small merged trim/ornament clusters.
// Colors baked per-part in mergeColored() are chosen to match the named
// palette (bronze, stone cream, dark steel) so these read as the same
// 1929 materials at a fraction of the draw calls a per-part mesh would cost.
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
const STONE = new THREE.Color(0xd8c9a0);
const BRONZE_C = new THREE.Color(0x6e5426);
const DARKSTEEL_C = new THREE.Color(0x2a2d33);
const SHADOW_C = new THREE.Color(0x14120f);
void BRONZE_C;

// ---------------------------------------------------------------------
// Enable optional per-instance emissive variation on the shared glassNight
// material (used by windowGrid v2's lit/dark instance-color split) without
// touching materials.js. Falls back exactly to the original uniform-glow
// look whenever a mesh has no InstancedMesh.instanceColor.
// ---------------------------------------------------------------------
if (!materials.glassNight.userData.mcInstancedEmissivePatched) {
  materials.glassNight.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif\n'
    );
  };
  materials.glassNight.needsUpdate = true;
  materials.glassNight.userData.mcInstancedEmissivePatched = true;
}

// ---------------------------------------------------------------------
// Re-exports: the v2 helper submodules (windows, signage, lamps, roofs).
// Districts import everything through this facade, per the contract.
// ---------------------------------------------------------------------
export { windowGrid } from './deco-windows.js';
export { canvasSign, decoDoorway } from './deco-signage.js';
export { streetlamp, setLampsNight, initLampPool, updateLampPool } from './deco-lamp.js';
export { rooftopClutter } from './deco-rooftop.js';
import { windowGrid } from './deco-windows.js';

/**
 * setbackTower — classic stepped-setback deco skyscraper with cornices,
 * instanced window bands, ziggurat crown and bronze finial.
 * @param {object} opts
 * @param {number}   [opts.width=20]  base width (m)
 * @param {number}   [opts.depth=20]  base depth (m)
 * @param {number}   [opts.height=80] total height (m)
 * @param {number}   [opts.setbacks=3] setback tiers above the base
 * @param {THREE.Material} [opts.material=materials.limestone]
 * @param {THREE.Material} [opts.windowMaterial=materials.glassDay]
 * @param {boolean}  [opts.crown=true] crown + finial on top
 * @returns {THREE.Group} origin at ground center
 */
export function setbackTower(opts = {}) {
  const {
    width = 20, depth = 20, height = 80,
    setbacks = 3, material = materials.limestone,
    windowMaterial = materials.glassDay, crown = true,
  } = opts;

  const g = new THREE.Group();
  const tiers = setbacks + 1;
  let y = 0, w = width, d = depth;

  for (let i = 0; i < tiers; i++) {
    const frac = i === 0 ? 0.4 : 0.6 / (tiers - 1);
    const h = height * frac;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    box.position.y = y + h / 2;
    g.add(box);

    // Window band on front (+Z) and back (-Z) faces via one shared instanced layout.
    const rows = Math.max(2, Math.floor(h / 3.5));
    const cols = Math.max(2, Math.floor(w / 4));
    const sx = w / (cols + 1), sy = Math.min(3, h / (rows + 1));
    const ww = Math.min(1.8, sx * 0.55);
    const grid = windowGrid({ rows, cols, spacingX: sx, spacingY: sy,
      width: ww, height: 2.2, material: windowMaterial });
    grid.position.set(0, y + h / 2, d / 2 + 0.06);
    g.add(grid);
    const back = grid.clone();
    back.position.z = -(d / 2 + 0.06);
    back.rotation.y = Math.PI;
    g.add(back);

    // Projecting cornice between tiers.
    const cor = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.9, 0.7, d + 0.9), materials.terracotta
    );
    cor.position.y = y + h;
    g.add(cor);

    y += h + 0.7;
    w *= 0.78; d *= 0.78;
  }

  if (crown) {
    const ch = height * 0.08;
    const cz = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.7, ch, 4), material);
    cz.rotation.y = Math.PI / 4;
    cz.position.y = y + ch / 2;
    g.add(cz);
    const fin = finial({ height: Math.min(10, height * 0.09) });
    fin.position.y = y + ch;
    g.add(fin);
  }
  return g;
}

/**
 * corniceBox — projecting stepped cornice slab.
 * @param {object} [opts]
 * @param {number} [opts.width=10]
 * @param {number} [opts.depth=10]
 * @param {number} [opts.height=0.6]
 * @param {THREE.Material} [opts.material=materials.limestone]
 * @returns {THREE.Mesh} centered in XZ, base at y=0
 */
export function corniceBox(opts = {}) {
  const { width = 10, depth = 10, height = 0.6, material = materials.limestone } = opts;
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  m.position.y = height / 2;
  return m;
}

/**
 * pilasterFacade — flat wall with rhythmic vertical pilasters.
 * @param {object} [opts]
 * @param {number} [opts.width=12]
 * @param {number} [opts.height=30]
 * @param {number} [opts.bays=5]
 * @param {THREE.Material} [opts.material=materials.limestone]
 * @param {THREE.Material} [opts.pilasterMaterial=materials.terracotta]
 * @returns {THREE.Group} origin bottom-center, wall faces +Z
 */
export function pilasterFacade(opts = {}) {
  const {
    width = 12, height = 30, bays = 5,
    material = materials.limestone, pilasterMaterial = materials.terracotta,
  } = opts;
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.4), material);
  wall.position.y = height / 2;
  g.add(wall);
  for (let i = 0; i <= bays; i++) {
    const x = -width / 2 + (width / bays) * i;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, height, 0.25), pilasterMaterial);
    p.position.set(x, height / 2, 0.28);
    g.add(p);
  }
  return g;
}

/**
 * finial — bronze needle finial for crowns.
 * @param {object} [opts]
 * @param {number} [opts.height=8]
 * @param {number} [opts.radius=0.35]
 * @param {THREE.Material} [opts.material=materials.bronze]
 * @returns {THREE.Mesh} base at y=0
 */
export function finial(opts = {}) {
  const { height = 8, radius = 0.35, material = materials.bronze } = opts;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.15, radius, height, 8), material);
  m.position.y = height / 2;
  return m;
}
