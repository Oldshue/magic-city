/**
 * deco.js — art deco geometry helper library for Magic City 1929.
 *
 * v2 (Facade Director + Storefront Director passes): windows are real
 * recessed units (dark reveal, glass set into the wall, projecting sill/
 * lintel, mullions); ground floors carry real storefronts (storefrontBand,
 * adopted inside setbackTower and pilasterFacade so every district's
 * towers/facades get shopfronts with no district-side edits); cornices
 * step in 2-3 shrinking tiers instead of one flat slab; roofs carry
 * mechanical clutter (water tanks, chimneys, bulkheads) plus parapet caps
 * on every setback shoulder — folded into the SAME merged draw call as
 * that shoulder's stepped cornice (corniceBox's additive rimHeight
 * option) so parapets cost zero extra draw calls over the v2 baseline;
 * the streetlamp reads as a period acorn/bishop-crook fixture. Every
 * previously exported signature keeps working — upgrades are internal or
 * additive-option only, per docs/TECH-CONTRACT.md.
 */
import * as THREE from 'three';
import { materials } from './materials.js';
import { mergeGeometries } from './deco-shared.js';

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
// Re-exports: the v2 helper submodules (windows, signage, lamps, roofs,
// storefronts, trees). Districts import everything through this facade,
// per the contract.
// ---------------------------------------------------------------------
export { windowGrid } from './deco-windows.js';
export { canvasSign, decoDoorway } from './deco-signage.js';
export { streetlamp, setLampsNight, initLampPool, updateLampPool } from './deco-lamp.js';
export { rooftopClutter } from './deco-rooftop.js';
export { storefrontBand } from './deco-storefront.js';
export { tree } from './deco-tree.js';
import { windowGrid } from './deco-windows.js';
import { rooftopClutter } from './deco-rooftop.js';
import { storefrontBand } from './deco-storefront.js';

/**
 * setbackTower — classic stepped-setback deco skyscraper with cornices,
 * instanced window bands, ziggurat crown and bronze finial.
 *
 * facade-v2: the ground tier's street-facing faces (+Z/-Z) now carry a
 * storefrontBand sized from the tower's base width, with the window band
 * filling the remainder of that tier's height above it. Every setback
 * shoulder (the flat roof ring exposed where the next tier steps in
 * smaller) gets sparse rooftopClutter, and its cornice is built with a
 * raised parapet-cap rim folded into the SAME merged mesh (corniceBox's
 * additive rimHeight option) — so parapets add zero extra draw calls.
 * The topmost shoulder (just under the crown) always receives a radio
 * mast.
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
  const baseSeed = Math.round(width * 131 + depth * 97 + height * 13) || 1;

  for (let i = 0; i < tiers; i++) {
    const frac = i === 0 ? 0.4 : 0.6 / (tiers - 1);
    const h = height * frac;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    box.position.y = y + h / 2;
    g.add(box);

    if (i === 0) {
      // Ground tier: storefront band at street level, window band filling
      // the rest of the tier's height above it (a tall ground tier reads
      // as several office floors over one shopfront floor).
      const sbHeight = Math.min(4.6, h * 0.55);
      const front = storefrontBand({ width: w, height: sbHeight, material, seed: baseSeed + 1 });
      front.position.set(0, y, d / 2 + 0.06);
      g.add(front);
      const backSb = storefrontBand({ width: w, height: sbHeight, material, seed: baseSeed + 2 });
      backSb.position.set(0, y, -(d / 2 + 0.06));
      backSb.rotation.y = Math.PI;
      g.add(backSb);

      const winH = Math.max(2.5, h - sbHeight);
      const rows = Math.max(1, Math.floor(winH / 3.5));
      const cols = Math.max(2, Math.floor(w / 4));
      const sx = w / (cols + 1), sy = Math.min(3, winH / (rows + 1));
      const ww = Math.min(1.8, sx * 0.55);
      const grid = windowGrid({ rows, cols, spacingX: sx, spacingY: sy,
        width: ww, height: 2.2, material: windowMaterial });
      grid.position.set(0, y + sbHeight + winH / 2, d / 2 + 0.06);
      g.add(grid);
      const gridBack = grid.clone();
      gridBack.position.z = -(d / 2 + 0.06);
      gridBack.rotation.y = Math.PI;
      g.add(gridBack);
    } else {
      // Upper tiers: window band across the full tier height, unchanged.
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
    }

    // Rooftop adoption: every setback shoulder gets sparse clutter. The
    // shoulder directly under the crown (the tallest one) always gets a
    // radio mast. Parapet caps are NOT a separate mesh here — they ride
    // along in this shoulder's own cornice call below via rimHeight, so
    // rooftop adoption costs only rooftopClutter's own (already merged)
    // draw calls, not one extra mesh per tier.
    const isShoulder = i < tiers - 1;
    if (isShoulder) {
      const nextW = w * 0.78, nextD = d * 0.78;
      const shoulderW = Math.max(0, w - nextW), shoulderD = Math.max(0, d - nextD);
      const roofSeed = baseSeed + i * 17 + 3;
      const isTopShoulder = i === tiers - 2;
      const clutter = rooftopClutter({
        width: Math.max(3, shoulderW * 2 + 2),
        depth: Math.max(3, shoulderD * 2 + 2),
        seed: roofSeed, mast: isTopShoulder,
      });
      const rngPlace = rand(roofSeed + 500);
      const angle = rngPlace() * Math.PI * 2;
      const reach = 0.5 + rngPlace() * 0.35;
      clutter.position.set(
        Math.cos(angle) * (nextW / 2) * reach,
        y + h,
        Math.sin(angle) * (nextD / 2) * reach
      );
      g.add(clutter);
    }

    // Stepped cornice between tiers (also caps the final tier under the
    // crown). Shoulder tiers fold a raised parapet-cap rim into this same
    // merged mesh via rimHeight, so the roof reads as a capped deck edge
    // rather than a bare slab at zero extra draw-call cost.
    const cor = corniceBox({
      width: w + 0.9, depth: d + 0.9, height: 0.7, material: materials.terracotta,
      steps: 3, rimHeight: isShoulder ? 0.32 : 0,
    });
    cor.position.y = y + h - 0.35;
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
 * corniceBox — projecting stepped cornice: 2-3 stacked boxes shrinking
 * upward (a real stepped profile instead of one flat slab), merged into a
 * single mesh so it still costs one draw call. An additive `rimHeight`
 * option (default 0, fully backward compatible) folds a thin raised
 * parapet-cap rim tracing the top step's outer edge into the SAME merged
 * mesh — used by setbackTower's shoulder tiers so parapet caps cost zero
 * extra draw calls over the plain stepped cornice.
 * @param {object} [opts]
 * @param {number} [opts.width=10]
 * @param {number} [opts.depth=10]
 * @param {number} [opts.height=0.6]
 * @param {THREE.Material} [opts.material=materials.limestone]
 * @param {number} [opts.steps=3] number of stacked steps (2-3)
 * @param {number} [opts.rimHeight=0] extra raised parapet rim on the top step's edge
 * @returns {THREE.Mesh} centered in XZ, base at y=0
 */
export function corniceBox(opts = {}) {
  const { width = 10, depth = 10, height = 0.6, material = materials.limestone, steps = 3, rimHeight = 0 } = opts;
  const n = Math.max(2, Math.min(3, Math.round(steps)));
  const stepH = height / n;
  const parts = [];
  let y = 0;
  let topW = width, topD = depth;
  for (let i = 0; i < n; i++) {
    const shrink = 1 - i * 0.16;
    const sw = width * shrink, sd = depth * shrink;
    const geo = new THREE.BoxGeometry(sw, stepH, sd);
    geo.translate(0, y + stepH / 2, 0);
    parts.push(geo);
    topW = sw; topD = sd;
    y += stepH;
  }
  if (rimHeight > 0) {
    const rimT = 0.22;
    const rimN = new THREE.BoxGeometry(topW + 0.1, rimHeight, rimT);
    rimN.translate(0, y + rimHeight / 2, topD / 2 - rimT / 2);
    const rimS = new THREE.BoxGeometry(topW + 0.1, rimHeight, rimT);
    rimS.translate(0, y + rimHeight / 2, -(topD / 2 - rimT / 2));
    const rimE = new THREE.BoxGeometry(rimT, rimHeight, topD + 0.1);
    rimE.translate(topW / 2 - rimT / 2, y + rimHeight / 2, 0);
    const rimW = new THREE.BoxGeometry(rimT, rimHeight, topD + 0.1);
    rimW.translate(-(topW / 2 - rimT / 2), y + rimHeight / 2, 0);
    parts.push(rimN, rimS, rimE, rimW);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), material);
  return m;
}

/**
 * pilasterFacade — flat wall with rhythmic vertical pilasters.
 *
 * facade-v2: the street-facing base now carries a storefrontBand sized
 * from the facade's width, with the flat pilastered wall filling the
 * remainder of the height above it. Pilasters still run the facade's
 * full original height (continuous verticals reading through the
 * storefront, as real deco piers do).
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

  const sbHeight = Math.min(4.6, height * 0.4);
  const wallH = Math.max(1, height - sbHeight);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, 0.4), material);
  wall.position.y = sbHeight + wallH / 2;
  g.add(wall);

  const seed = Math.round(width * 151 + height * 61 + bays * 29) || 1;
  const band = storefrontBand({ width, bays, height: sbHeight, material, seed });
  band.position.set(0, 0, 0.2);
  g.add(band);

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
