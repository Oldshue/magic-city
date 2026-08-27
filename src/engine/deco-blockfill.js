/**
 * deco-blockfill.js — blockFill(): the generic party-wall street-fabric
 * block generator. Districts call this to fill a block's frontages with
 * continuous shoulder-to-shoulder party-wall buildings (2-6 stories,
 * storefronts below / offices above, sawtooth parapet skyline, alley and
 * service yard behind) instead of leaving bare ground between landmarks.
 *
 * Reuses (never reimplements) windowGrid, storefrontBand, corniceBox and
 * rooftopClutter via the caller's `deco` namespace param (never imports
 * deco.js directly — deco.js re-exports THIS module, so importing it here
 * would be circular), and rand/mergeGeometries from deco-shared.js.
 *
 * Coordinate convention matches the rest of deco.js: block {x0,z0,x1,z1}
 * is the outer rectangle of buildable lot area (already inside sidewalks).
 * +X = east, +Z = south (tech contract). "north" frontage = the z0 edge
 * (smaller z), "south" = z1 edge, "west" = x0 edge, "east" = x1 edge.
 *
 * Draw-call budget: windowGrid/storefrontBand/rooftopClutter each emit
 * their own small fixed set of (Instanced)Meshes per call; calling them
 * once per lot/run/rooftop and adding the returned groups directly would
 * blow the block's draw-call budget. Instead every helper call's child
 * meshes are flattened into WORLD-SPACE BufferGeometries (baking each
 * child's own matrix, instance matrix, and the lot's world transform),
 * bucketed by the material they were built with, and merged ONCE per
 * bucket for the whole block — so the result stays ~10 draw calls
 * regardless of lot count.
 *
 * @param {object} opts
 * @param {THREE} [opts.THREE] unused directly (THREE is imported by this module); accepted for ctx-shape compatibility
 * @param {object} [opts.materials] shared material palette (materials.js); defaults to the real singleton
 * @param {object} opts.deco the caller's deco.js namespace (windowGrid, storefrontBand, corniceBox, rooftopClutter, ...)
 * @param {number} [opts.seed=1] deterministic seed — same inputs, same block, always
 * @param {{x0:number,z0:number,x1:number,z1:number}} opts.block outer buildable rectangle
 * @param {{side:'north'|'south'|'east'|'west',from:number,to:number}[]} [opts.gaps] frontage stretches to leave empty (existing landmark stands there)
 * @param {'commercial'|'warehouse'|'rowhouse'} [opts.use='commercial']
 * @param {[number,number]} [opts.floorsRange=[2,5]] seeded floor count range, weighted low
 * @param {boolean} [opts.alley=true] add a service alley through the block interior when deep enough
 * @returns {THREE.Group} children already positioned in world space
 */
import * as THREE from '../../vendor/three.module.min.js';
import { materials as sharedMaterials } from './materials.js';
import { rand, mergeGeometries } from './deco-shared.js';

const PALETTE = [
  new THREE.Color(0x5c2418), // oxblood brick
  new THREE.Color(0xb99a6b), // tan brick
  new THREE.Color(0xd8c9a0), // buff limestone
  new THREE.Color(0x6b7860), // painted gray-green
];

const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.03 });
const roofColoredMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x3c342a, roughness: 1.0, metalness: 0.0 });
const GHOST_DARK = new THREE.Color(0x1c1712);
const GHOST_FADE = new THREE.Color(0x4a3f30);
const SIGNBOARD_DARK = new THREE.Color(0x201c16);
const CRATE_C = new THREE.Color(0x6b4a2c);
const BARREL_C = new THREE.Color(0x3a3630);

/** Period ad copy pool for ghost-sign flank walls (kept for callers/future canvasSign use). */
export const AD_COPY = [
  'COCA-COLA RELIEVES FATIGUE 5c', 'BROMO-SELTZER', 'MAIL POUCH TOBACCO',
  'OWL CIGAR NOW 5c', 'MARTIN BISCUIT CO', 'BUFFALO ROCK GINGER ALE',
  'DRINK GRAPICO', 'AVONDALE MILLS SHEETING', 'MOORE-HANDLEY HARDWARE',
  'LOVEMAN JOSEPH & LOEB',
];

const GROUND_H = { commercial: 4.5, warehouse: 5.2, rowhouse: 3.6 };
const FLOOR_H = 3.6;

// rotY so local +Z (the wall-face "origin flush with outer face, opens
// toward +Z" convention shared by windowGrid/storefrontBand, and matched
// by this file's own lot boxes) points away from the block toward the
// street on each side.
const SIDE_DEFS = {
  north: { axis: 'z', rotY: Math.PI },
  south: { axis: 'z', rotY: 0 },
  west: { axis: 'x', rotY: -Math.PI / 2 },
  east: { axis: 'x', rotY: Math.PI / 2 },
};

// ---------------------------------------------------------------------
// Small local utilities
// ---------------------------------------------------------------------
function subdivideFrontage(length, rng, minW, maxW) {
  const widths = [];
  let remaining = length;
  while (remaining > 0.4) {
    let w = minW + rng() * (maxW - minW);
    if (w >= remaining) { widths.push(remaining); remaining = 0; break; }
    if (remaining - w < minW * 0.6) w = remaining;
    widths.push(w);
    remaining -= w;
  }
  return widths;
}

function gapRangesForSide(gaps, side) {
  return gaps.filter(g => g.side === side).map(g => [Math.min(g.from, g.to), Math.max(g.from, g.to)]);
}

function overlapsGap(a0, a1, ranges) {
  return ranges.some(([g0, g1]) => a0 < g1 - 0.05 && a1 > g0 + 0.05);
}

function pickFloors(rng, floorsRange) {
  if (rng() < 0.08) return 1; // occasional 1-story taxpayer, big parapet sign board
  const [lo, hi] = floorsRange;
  const w = rng() * rng(); // weighted toward the low end
  return Math.max(lo, Math.min(hi, Math.round(lo + w * (hi - lo))));
}

function bakeColor(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Like mergeGeometries, but preserves (or bakes white for) each geometry's
// own 'color' attribute — used for buckets whose geometries already carry
// per-part vertex color (body lots, rooftop bulkheads, alley clutter).
function mergeColoredGeoms(geoms) {
  for (const g of geoms) if (!g.attributes.color) bakeColor(g, new THREE.Color(0xffffff));
  let vertCount = 0, idxCount = 0;
  for (const g of geoms) { vertCount += g.attributes.position.count; idxCount += g.index ? g.index.count : g.attributes.position.count; }
  const position = new Float32Array(vertCount * 3);
  const normal = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const color = new Float32Array(vertCount * 3);
  const IndexArr = idxCount > 65535 ? Uint32Array : Uint16Array;
  const index = new IndexArr(idxCount);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    position.set(g.attributes.position.array, vOff * 3);
    normal.set(g.attributes.normal.array, vOff * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
    color.set(g.attributes.color.array, vOff * 3);
    const idx = g.index ? g.index.array : Array.from({ length: g.attributes.position.count }, (_, k) => k);
    for (let i = 0; i < idx.length; i++) index[iOff + i] = idx[i] + vOff;
    vOff += g.attributes.position.count; iOff += idx.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

// ---------------------------------------------------------------------
// Flatten helpers: expand a windowGrid/storefrontBand/rooftopClutter
// Group's child (Instanced)Meshes into world-space geometries so calling
// these helpers once per lot/run/roof still merges into a handful of
// draw calls for the whole block.
// ---------------------------------------------------------------------
function expandInstanced(mesh, worldMatrix, out) {
  mesh.updateMatrix();
  const im = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, im);
    const g = mesh.geometry.clone();
    g.applyMatrix4(im);
    g.applyMatrix4(mesh.matrix);
    g.applyMatrix4(worldMatrix);
    out.push(g);
  }
}
function expandInstancedSplit(mesh, worldMatrix, outDark, outLit) {
  // windowGrid marks lit panes via instanceColor (warm ~1.0) when handed
  // glassNight; route lit instances to their own bucket so the merged
  // block keeps the day/night window idiom without per-lot draw calls.
  mesh.updateMatrix();
  const im = new THREE.Matrix4();
  const ic = mesh.instanceColor;
  const c = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, im);
    const g = mesh.geometry.clone();
    g.applyMatrix4(im);
    g.applyMatrix4(mesh.matrix);
    g.applyMatrix4(worldMatrix);
    let lit = false;
    if (ic) { c.fromBufferAttribute(ic, i); lit = c.r > 0.5; }
    (lit ? outLit : outDark).push(g);
  }
}
function expandMesh(mesh, worldMatrix, out) {
  mesh.updateMatrix();
  const g = mesh.geometry.clone();
  g.applyMatrix4(mesh.matrix);
  g.applyMatrix4(worldMatrix);
  out.push(g);
}

function collectFromWindowGrid(grid, worldMatrix, out) {
  const names = ['trim', 'ledge', 'glass'];
  grid.children.forEach((child, i) => {
    const key = names[i];
    if (!key) return;
    if (key === 'glass' && child.isInstancedMesh) expandInstancedSplit(child, worldMatrix, out.glass, out.glassLit);
    else if (child.isInstancedMesh) expandInstanced(child, worldMatrix, out[key]);
    else if (child.isMesh) expandMesh(child, worldMatrix, out[key]);
  });
}

function collectFromStorefront(band, worldMatrix, out) {
  const names = ['masonry', 'bronze', 'glass', 'door', 'awning', 'glassLit'];
  band.children.forEach((child, i) => {
    const key = names[i];
    if (!key || !child.isMesh) return;
    if (key === 'awning' && !out.awningMat) out.awningMat = child.material;
    expandMesh(child, worldMatrix, out[key]);
  });
}

function collectFromRooftop(clutter, worldMatrix, steelOut, brickOut, coloredOut) {
  clutter.children.forEach(child => {
    if (!child.isMesh) return;
    if (child.material === sharedMaterials.steelDark) expandMesh(child, worldMatrix, steelOut);
    else if (child.material === sharedMaterials.brick) expandMesh(child, worldMatrix, brickOut);
    else expandMesh(child, worldMatrix, coloredOut); // vertex-colored bulkhead — already carries its own color attr
  });
}

function lotMatrix(lot) {
  return new THREE.Matrix4().makeTranslation(lot.worldX, 0, lot.worldZ).multiply(new THREE.Matrix4().makeRotationY(lot.def.rotY));
}

// ---------------------------------------------------------------------
// Street faces: windows, storefront runs, sign boards, ghost signs.
// ---------------------------------------------------------------------
function buildStreetFaces(lotsBySide, bodyParts, ctx, buckets) {
  const { deco, materials, use, groundH } = ctx;
  for (const side of ['north', 'south', 'east', 'west']) {
    const lots = lotsBySide[side];
    if (!lots.length) continue;
    const def = SIDE_DEFS[side];

    // Contiguous frontage runs (unbroken by a gap) get ONE storefrontBand
    // call spanning the whole run — a continuous shopfront, per the brief.
    let runStart = 0;
    for (let i = 0; i <= lots.length; i++) {
      const atEnd = i === lots.length;
      const broke = atEnd || (i > 0 && Math.abs(lots[i].a0 - lots[i - 1].a1) > 0.5);
      if (broke) {
        if (i > runStart && use !== 'warehouse') {
          const run = lots.slice(runStart, i);
          const runWidth = run[run.length - 1].a1 - run[0].a0;
          const runMid = (run[0].a0 + run[run.length - 1].a1) / 2;
          const anchor = run[0];
          const wx = def.axis === 'z' ? runMid : anchor.worldX;
          const wz = def.axis === 'z' ? anchor.worldZ : runMid;
          const band = deco.storefrontBand({
            width: runWidth, bays: run.length, height: groundH,
            material: materials.limestone, awnings: use === 'commercial',
            seed: anchor.lotSeed + 41,
          });
          const wm = new THREE.Matrix4().makeTranslation(wx, 0, wz).multiply(new THREE.Matrix4().makeRotationY(def.rotY));
          collectFromStorefront(band, wm, buckets.sf);
        }
        runStart = i;
      }
    }

    for (const lot of lots) {
      const { worldX, worldZ, totalH, lotRng, lotSeed } = lot;
      const w = lot.a1 - lot.a0;
      const winBase = use === 'warehouse' ? 0 : groundH;
      const winH = Math.max(0, totalH - winBase);
      if (winH >= 1.6 && w >= 3) {
        const rows = Math.max(1, Math.round(winH / (use === 'warehouse' ? 3.2 : 3.6)));
        const cols = Math.max(1, Math.floor((w - 1) / (use === 'rowhouse' ? 2.2 : 2.8)));
        const sx = w / (cols + 1), sy = Math.min(3.4, winH / (rows + 1));
        const ww = Math.min(1.6, sx * (use === 'warehouse' ? 0.4 : 0.55));
        const grid = deco.windowGrid({
          rows, cols, spacingX: sx, spacingY: sy, width: ww, height: 2.0,
          material: materials.glassNight, seed: lotSeed + 71,
        });
        const localY = winBase + winH / 2;
        const wm = new THREE.Matrix4().makeTranslation(worldX, localY, worldZ).multiply(new THREE.Matrix4().makeRotationY(def.rotY));
        collectFromWindowGrid(grid, wm, buckets.win);
      }

      // Occasional flat sign board on the parapet, 1 in 4, seeded.
      if (lotRng() < 0.25) {
        const boardW = Math.min(w * 0.7, 6);
        const boardGeo = new THREE.BoxGeometry(boardW, 1.6, 0.15);
        boardGeo.translate(0, totalH + 0.9, 0.08);
        boardGeo.rotateY(def.rotY);
        boardGeo.translate(worldX, 0, worldZ);
        bakeColor(boardGeo, SIGNBOARD_DARK);
        bodyParts.push(boardGeo);
      }
    }

    // Ghost signs: a lot 3+ floors whose contiguous neighbor is 2+ floors
    // shorter (or has no neighbor — an exposed end/gap) gets, 1 in 3
    // seeded, a painted-ad flank rectangle with faded lettering-suggestion
    // stripes (the brief's documented fallback for when a flat wall
    // placement isn't guaranteed) — merged straight into the body's own
    // vertex-colored mesh, so it costs zero extra draw calls.
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      if (lot.floors < 3) continue;
      const prev = lots[i - 1], next = lots[i + 1];
      const prevAdj = prev && Math.abs(prev.a1 - lot.a0) < 0.5;
      const nextAdj = next && Math.abs(next.a0 - lot.a1) < 0.5;
      const prevShorter = !prevAdj || prev.floors <= lot.floors - 2;
      const nextShorter = !nextAdj || next.floors <= lot.floors - 2;
      if (!prevShorter && !nextShorter) continue;
      if (lot.lotRng() >= 1 / 3) continue;
      const flankLocalX = prevShorter ? -(lot.a1 - lot.a0) / 2 - 0.02 : (lot.a1 - lot.a0) / 2 + 0.02;
      addGhostSign(bodyParts, lot, flankLocalX);
    }
  }
}

function addGhostSign(bodyParts, lot, flankLocalX) {
  const signW = Math.min(lot.depthLot * 0.55, 8);
  const signH = Math.min(lot.totalH * 0.5, 6);
  const y = lot.totalH * 0.55;
  const zMid = -lot.depthLot / 2;
  const wm = lotMatrix(lot);
  const panel = new THREE.BoxGeometry(0.06, signH, signW);
  panel.translate(flankLocalX, y, zMid);
  panel.applyMatrix4(wm);
  bakeColor(panel, GHOST_DARK);
  bodyParts.push(panel);
  for (let s = 0; s < 3; s++) {
    const stripe = new THREE.BoxGeometry(0.07, signH * 0.08, signW * 0.7);
    stripe.translate(flankLocalX, y + signH * (0.28 - s * 0.22), zMid);
    stripe.applyMatrix4(wm);
    bakeColor(stripe, GHOST_FADE);
    bodyParts.push(stripe);
  }
}

// ---------------------------------------------------------------------
// Rooftops: rooftopClutter on ~half the lots, seeded.
// ---------------------------------------------------------------------
function buildRooftops(lotsBySide, ctx, buckets) {
  const { deco } = ctx;
  for (const side of ['north', 'south', 'east', 'west']) {
    for (const lot of lotsBySide[side]) {
      if (lot.lotRng() >= 0.5) continue;
      const w = lot.a1 - lot.a0;
      const clutter = deco.rooftopClutter({ width: w, depth: lot.depthLot, seed: lot.lotSeed + 191, mast: lot.floors >= 5 });
      const wm = new THREE.Matrix4().makeTranslation(lot.worldX, lot.totalH, lot.worldZ)
        .multiply(new THREE.Matrix4().makeRotationY(lot.def.rotY))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, -lot.depthLot / 2));
      collectFromRooftop(clutter, wm, buckets.roofSteel, buckets.roofBrick, buckets.roofColored);
    }
  }
}

// ---------------------------------------------------------------------
// Alley: packed-dirt/cinder strip, instanced poles, fire escapes, crates.
// ---------------------------------------------------------------------
function buildAlley(block, materials, seed, group, extraColoredGeoms) {
  const width = block.x1 - block.x0, depth = block.z1 - block.z0;
  const longAxisX = width >= depth;
  const stripW = 4;
  const dirtGeo = longAxisX
    ? new THREE.BoxGeometry(width - 4, 0.1, stripW)
    : new THREE.BoxGeometry(stripW, 0.1, depth - 4);
  dirtGeo.translate((block.x0 + block.x1) / 2, 0.05, (block.z0 + block.z1) / 2);
  const dirtMesh = new THREE.Mesh(dirtGeo, dirtMat);
  dirtMesh.receiveShadow = true;
  group.add(dirtMesh);

  const rng = rand((seed || 1) + 9001);
  const steelParts = [];
  const nPoles = Math.max(2, Math.round((longAxisX ? width : depth) / 24));
  for (let i = 0; i < nPoles; i++) {
    const f = nPoles === 1 ? 0.5 : i / (nPoles - 1);
    const x = longAxisX ? block.x0 + 2 + f * (width - 4) : (block.x0 + block.x1) / 2 + (rng() - 0.5) * 2;
    const z = longAxisX ? (block.z0 + block.z1) / 2 + (rng() - 0.5) * 2 : block.z0 + 2 + f * (depth - 4);
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6);
    pole.translate(x, 2.75, z);
    steelParts.push(pole);
  }

  // Fire escapes (simple steel zigzag from thin boxes) on 2-3 rear walls.
  const nEsc = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < nEsc; i++) {
    const ex = longAxisX ? block.x0 + rng() * width : (block.x0 + block.x1) / 2 + (rng() - 0.5) * (width - 6);
    const ez = longAxisX ? (block.z0 + block.z1) / 2 + (rng() - 0.5) * (depth - 6) : block.z0 + rng() * depth;
    for (let lvl = 0; lvl < 3; lvl++) {
      const plat = new THREE.BoxGeometry(1.4, 0.06, 1.0);
      plat.translate(ex, 3 + lvl * 3, ez);
      steelParts.push(plat);
      const brace = new THREE.BoxGeometry(1.4, 3, 0.06);
      brace.rotateX(0.4);
      brace.translate(ex, 1.5 + lvl * 3, ez + 0.5);
      steelParts.push(brace);
    }
  }
  if (steelParts.length) {
    const m = new THREE.Mesh(mergeGeometries(steelParts), materials.steelDark);
    m.userData.noShadow = true;
    group.add(m);
  }

  // Crates/barrels/wagon clutter — merged with any leftover rooftop
  // bulkhead geometry into ONE vertex-colored mesh (shared roofColoredMat).
  const clutterParts = [...(extraColoredGeoms || [])];
  const nClusters = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nClusters; i++) {
    const cx = block.x0 + 2 + rng() * (width - 4);
    const cz = block.z0 + 2 + rng() * (depth - 4);
    const crate = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    crate.translate(cx, 0.4, cz);
    bakeColor(crate, CRATE_C);
    clutterParts.push(crate);
    const barrel = new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8);
    barrel.translate(cx + 0.9, 0.45, cz + 0.3);
    bakeColor(barrel, BARREL_C);
    clutterParts.push(barrel);
  }
  if (clutterParts.length) {
    const m = new THREE.Mesh(mergeColoredGeoms(clutterParts), roofColoredMat);
    m.userData.noShadow = true;
    group.add(m);
  }
}

// ---------------------------------------------------------------------
// blockFill — the public entry point.
// ---------------------------------------------------------------------
export function blockFill(opts = {}) {
  const {
    materials = sharedMaterials, deco, seed = 1, block,
    gaps = [], use = 'commercial', floorsRange = [2, 5], alley = true,
  } = opts;
  const group = new THREE.Group();
  group.name = 'blockfill';
  if (!block || !deco) return group;
  const { x0, z0, x1, z1 } = block;
  const width = x1 - x0, depth = z1 - z0;
  const shortSpan = Math.min(width, depth);
  const singleRow = shortSpan < 30;
  const minW = use === 'rowhouse' ? 6 : 8;
  const maxW = use === 'rowhouse' ? 10 : 18;
  const groundH = GROUND_H[use] || GROUND_H.commercial;
  const doAlley = alley && !singleRow;

  const bodyParts = []; // world-space geometries, each already carrying a baked 'color' attribute
  const corniceGeos = [];
  const lotsBySide = { north: [], south: [], east: [], west: [] };

  for (const side of ['north', 'south', 'east', 'west']) {
    const def = SIDE_DEFS[side];
    const from = def.axis === 'z' ? x0 : z0;
    const to = def.axis === 'z' ? x1 : z1;
    const gapRanges = gapRangesForSide(gaps, side);
    const subRng = rand(Math.round(seed * 7919 + side.length * 131 + from * 3 + to * 5) || 1);
    const widths = subdivideFrontage(to - from, subRng, minW, maxW);
    let cursor = from, idx = 0;
    for (const w of widths) {
      const a0 = cursor, a1 = cursor + w;
      cursor = a1; idx++;
      if (overlapsGap(a0, a1, gapRanges)) continue;
      const lotSeed = Math.round(seed * 131 + side.charCodeAt(0) * 977 + a0 * 13 + a1 * 7) || 1;
      const lotRng = rand(lotSeed);
      const depthLot = singleRow ? Math.max(4, shortSpan / 2 - 0.4) : 14 + lotRng() * 6;
      const floors = pickFloors(lotRng, floorsRange);
      const totalH = groundH + Math.max(0, floors - 1) * FLOOR_H;
      const mid = (a0 + a1) / 2;
      let worldX, worldZ;
      if (side === 'north') { worldX = mid; worldZ = z0; }
      else if (side === 'south') { worldX = mid; worldZ = z1; }
      else if (side === 'west') { worldX = x0; worldZ = mid; }
      else { worldX = x1; worldZ = mid; }
      const color = PALETTE[Math.floor(lotRng() * PALETTE.length)];

      // Body box: local X=w, Y=totalH, Z spans [-depthLot,0] (outer wall
      // face at local z=0, matching windowGrid/storefrontBand's own wall
      // convention), baked into world space so every lot on the block
      // still merges into ONE draw call. Party-wall ends and the rear wall
      // need no separate geometry — they're just this box's own side/back
      // faces, already textured via the same baked vertex color.
      const bg = new THREE.BoxGeometry(w - 0.2, totalH, depthLot - 0.15);
      bg.translate(0, totalH / 2, -depthLot / 2);
      bg.rotateY(def.rotY);
      bg.translate(worldX, 0, worldZ);
      bakeColor(bg, color);
      bodyParts.push(bg);

      // Parapet/cornice at this lot's own height — deliberately varies lot
      // to lot (the sawtooth roofline is the whole point). corniceBox is
      // reused unmodified; only its geometry is read back out so the
      // whole block's parapets still merge into a single draw call.
      const cor = deco.corniceBox({
        width: w - 0.1, depth: depthLot - 0.05, height: 0.6, material: materials.terracotta,
        steps: 2 + (idx % 2), rimHeight: 0.3 + lotRng() * 0.35,
      });
      cor.geometry.translate(0, totalH - 0.3, -depthLot / 2);
      cor.geometry.rotateY(def.rotY);
      cor.geometry.translate(worldX, 0, worldZ);
      corniceGeos.push(cor.geometry);

      lotsBySide[side].push({ side, def, a0, a1, mid, depthLot, floors, totalH, worldX, worldZ, color, lotRng, lotSeed });
    }
  }

  const buckets = {
    sf: { masonry: [], bronze: [], glass: [], door: [], awning: [], glassLit: [] },
    win: { trim: [], ledge: [], glass: [], glassLit: [] },
    roofSteel: [], roofBrick: [], roofColored: [],
  };
  const ctx = { deco, materials, use, groundH, seed };
  buildStreetFaces(lotsBySide, bodyParts, ctx, buckets);
  buildRooftops(lotsBySide, ctx, buckets);

  // --- final merges: one mesh per material bucket for the whole block ---
  if (bodyParts.length) {
    const m = new THREE.Mesh(mergeColoredGeoms(bodyParts), bodyMat);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  const terracottaGeos = [...corniceGeos, ...buckets.win.ledge];
  if (terracottaGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(terracottaGeos), materials.terracotta);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  const steelGeos = [...buckets.win.trim, ...buckets.sf.door, ...buckets.roofSteel];
  if (steelGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(steelGeos), materials.steelDark);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  if (buckets.win.glassLit.length) {
    const m = new THREE.Mesh(mergeGeometries(buckets.win.glassLit), materials.glassNight);
    m.castShadow = false; m.receiveShadow = false; m.userData.noShadow = true; group.add(m);
  }
  const glassGeos = [...buckets.win.glass, ...buckets.sf.glass];
  if (glassGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(glassGeos), materials.glassDay);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  if (buckets.sf.masonry.length) {
    const m = new THREE.Mesh(mergeGeometries(buckets.sf.masonry), materials.limestone);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  if (buckets.sf.bronze.length) {
    const m = new THREE.Mesh(mergeGeometries(buckets.sf.bronze), materials.bronze);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  if (buckets.sf.awning.length && buckets.sf.awningMat) {
    const m = new THREE.Mesh(mergeGeometries(buckets.sf.awning), buckets.sf.awningMat);
    m.userData.noShadow = true; group.add(m);
  }
  if (buckets.sf.glassLit.length) {
    const m = new THREE.Mesh(mergeGeometries(buckets.sf.glassLit), materials.glassNight);
    m.userData.noShadow = true; group.add(m);
  }
  if (buckets.roofBrick.length) {
    const m = new THREE.Mesh(mergeGeometries(buckets.roofBrick), materials.brick);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }

  if (doAlley) {
    buildAlley(block, materials, seed, group, buckets.roofColored);
  } else if (buckets.roofColored.length) {
    const m = new THREE.Mesh(mergeColoredGeoms(buckets.roofColored), roofColoredMat);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }

  return group;
}
