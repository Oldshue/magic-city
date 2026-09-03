/**
 * deco-facade.js — Facade Detail pass: reusable helpers that dress a box
 * building or roof with 1929 ornament. Purely additive alongside deco.js's
 * existing exports (setbackTower, pilasterFacade, corniceBox, etc. are
 * untouched). Re-exported from deco.js per docs/TECH-CONTRACT.md so no
 * district needs to import this file directly.
 *
 * facadeDetail(opts)   — cornice w/ dentil rhythm + parapet, string
 *                          courses every N floors, instanced window
 *                          reveals/sills, optional storefront base
 *                          (reuses storefrontBand).
 * fireEscape(opts)     — zigzag stairs + landings on a brick side wall.
 * rooftopKit(opts)     — water tank, chimneys, skylight monitor, hatch.
 * awning(opts)         — striped canvas storefront awning.
 * shopSign(text, opts) — projecting blade sign (wraps canvasSign).
 *
 * Every helper merges or instances its geometry so applying the whole kit
 * across a district's landmarks + infill + storefronts stays well inside
 * the ~150-draw-call budget in docs/TECH-CONTRACT.md.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { materials } from './materials.js';
import { mergeGeometries, awningTexture } from './deco-shared.js';
import { canvasSign } from './deco-signage.js';
import { storefrontBand } from './deco-storefront.js';

function rand(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
void rand;

// Vertex-colored merge for small striped/tinted ornament clusters (local
// duplicate of deco.js's private mergeColored — that helper isn't
// exported, and this file must not modify deco.js beyond adding exports).
function mergeColoredLocal(parts) {
  let vertCount = 0, idxCount = 0;
  for (const p of parts) { vertCount += p.geo.attributes.position.count; idxCount += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
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
    const idx = g.index ? g.index.array : Array.from({ length: g.attributes.position.count }, (_, k) => k);
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
const stripeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.0 });
const STRIPE_A = new THREE.Color(0x8a2b22);
const STRIPE_B = new THREE.Color(0xe8ddc4);

// Dentil-rhythm cornice slab with an optional raised parapet rim folded
// into the same merged mesh (same zero-extra-draw-call trick as deco.js's
// corniceBox rimHeight option).
function dentilCornice(width, depth, y, material, parapetHeight) {
  const parts = [];
  const band = new THREE.BoxGeometry(width, 0.55, depth);
  band.translate(0, y + 0.275, 0);
  parts.push(band);
  const toothW = 0.32, toothD = 0.22, toothH = 0.22;
  const nX = Math.max(4, Math.floor(width / 0.6));
  const nZ = Math.max(4, Math.floor(depth / 0.6));
  for (let i = 0; i < nX; i++) {
    const x = -width / 2 + (i + 0.5) * (width / nX);
    for (const zz of [depth / 2 - 0.02, -(depth / 2 - 0.02)]) {
      const t = new THREE.BoxGeometry(toothW, toothH, toothD);
      t.translate(x, y - toothH / 2 + 0.05, zz);
      parts.push(t);
    }
  }
  for (let i = 0; i < nZ; i++) {
    const z = -depth / 2 + (i + 0.5) * (depth / nZ);
    for (const xx of [width / 2 - 0.02, -(width / 2 - 0.02)]) {
      const t = new THREE.BoxGeometry(toothD, toothH, toothW);
      t.translate(xx, y - toothH / 2 + 0.05, z);
      parts.push(t);
    }
  }
  if (parapetHeight > 0) {
    const rimT = 0.2;
    const rimN = new THREE.BoxGeometry(width, parapetHeight, rimT);
    rimN.translate(0, y + 0.55 + parapetHeight / 2, depth / 2 - rimT / 2);
    const rimS = rimN.clone(); rimS.translate(0, 0, -(depth - rimT));
    const rimE = new THREE.BoxGeometry(rimT, parapetHeight, depth);
    rimE.translate(width / 2 - rimT / 2, y + 0.55 + parapetHeight / 2, 0);
    const rimW = rimE.clone(); rimW.translate(-(width - rimT), 0, 0);
    parts.push(rimN, rimS, rimE, rimW);
  }
  return new THREE.Mesh(mergeGeometries(parts), material);
}

// Thin string-course bands wrapping the full footprint every N floors.
function stringCourses(width, depth, floors, everyN, floorH, material) {
  const parts = [];
  for (let f = everyN; f < floors; f += everyN) {
    const y = f * floorH;
    const b = new THREE.BoxGeometry(width + 0.18, 0.16, depth + 0.18);
    b.translate(0, y, 0);
    parts.push(b);
  }
  if (!parts.length) return null;
  return new THREE.Mesh(mergeGeometries(parts), material);
}

// One reveal+sill unit, scaled per-instance to each window bay.
const revealUnitGeo = (() => {
  const reveal = new THREE.BoxGeometry(1.0, 1.0, 0.12);
  reveal.translate(0, 0, -0.06);
  const sill = new THREE.BoxGeometry(1.22, 0.12, 0.28);
  sill.translate(0, -0.56, 0.12);
  return mergeGeometries([reveal, sill]);
})();

/**
 * facadeDetail — dresses a box building (landmark tower, infill block) with
 * a dentil-rhythm cornice + raised parapet cap, thin string courses every
 * N floors, instanced dark window reveals + projecting sills across all
 * four faces, and an optional storefront base (reuses storefrontBand).
 * Merged/instanced throughout: cornice+parapet is one mesh, string courses
 * one mesh, reveals+sills one InstancedMesh — a landmark's call costs well
 * under 10 draw calls even with storefront:true.
 * @param {object} [opts]
 * @param {number} [opts.width=20] building width (m)
 * @param {number} [opts.depth=20] building depth (m)
 * @param {number} [opts.height=40] building height (m); cornice sits here
 * @param {number} [opts.floorHeight=3.5] floor-to-floor height (m)
 * @param {THREE.Material} [opts.material=materials.limestone] wall masonry
 * @param {number} [opts.seed=1] deterministic seed (storefront doors)
 * @param {boolean} [opts.storefront=false] add a storefrontBand ground floor
 * @param {number} [opts.courseEvery=5] wrap a string course every N floors
 * @param {number} [opts.parapetHeight=0.4] raised parapet rim on the cornice
 * @returns {THREE.Group} origin at ground center, aligned with the host box
 */
export function facadeDetail(opts = {}) {
  const {
    width = 20, depth = 20, height = 40, floorHeight = 3.5,
    material = materials.limestone, seed = 1, storefront = false,
    courseEvery = 5, parapetHeight = 0.4,
  } = opts;
  const g = new THREE.Group();
  const floors = Math.max(2, Math.round(height / floorHeight));
  const hx = width / 2, hz = depth / 2;

  g.add(dentilCornice(width + 0.6, depth + 0.6, height - 0.3, materials.terracotta, parapetHeight));

  const courses = stringCourses(width, depth, floors, courseEvery, floorHeight, materials.terracotta);
  if (courses) g.add(courses);

  const startRow = storefront ? 1 : 0;
  const cols = Math.max(2, Math.floor(width / 4));
  const colsSide = Math.max(1, Math.floor(depth / 5));
  const sx = width / (cols + 1), sxSide = depth / (colsSide + 1);
  const positions = [];
  for (let r = startRow; r < floors - 1; r++) {
    const y = r * floorHeight + floorHeight * 0.55;
    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + (c + 1) * sx;
      positions.push([x, y, hz, 0]);
      positions.push([x, y, -hz, Math.PI]);
    }
    for (let c = 0; c < colsSide; c++) {
      const z = -depth / 2 + (c + 1) * sxSide;
      positions.push([hx, y, z, Math.PI / 2]);
      positions.push([-hx, y, z, -Math.PI / 2]);
    }
  }
  if (positions.length) {
    const inst = new THREE.InstancedMesh(revealUnitGeo, materials.steelDark, positions.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1.3, 1.6, 1), pos = new THREE.Vector3(), eul = new THREE.Euler();
    positions.forEach(([x, y, z, rotY], i) => {
      eul.set(0, rotY, 0); q.setFromEuler(eul); pos.set(x, y, z);
      m4.compose(pos, q, sc);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
  }

  if (storefront) {
    const sbH = Math.min(4.6, height * 0.2);
    const front = storefrontBand({ width, height: sbH, material, seed });
    front.position.set(0, 0, hz + 0.06);
    g.add(front);
    const back = storefrontBand({ width, height: sbH, material, seed: seed + 1 });
    back.position.set(0, 0, -(hz + 0.06));
    back.rotation.y = Math.PI;
    g.add(back);
  }
  return g;
}

/**
 * fireEscape — zigzag exterior fire-escape stair with landings, merged
 * into two draw calls (stair/landing structure + railings). Mounted
 * flush to a wall: local origin at the wall base, wall face at z=0,
 * climbing in alternating left/right runs up to `height`.
 * @param {object} [opts]
 * @param {number} [opts.height=24] total height climbed (m)
 * @param {number} [opts.floors=7] number of landings (~one per floor)
 * @param {number} [opts.width=1.4] landing/stair width (m)
 * @param {THREE.Material} [opts.material=materials.steelDark]
 * @returns {THREE.Group} origin at wall base, projects toward +Z
 */
export function fireEscape(opts = {}) {
  const { height = 24, floors = 7, width = 1.4, material = materials.steelDark } = opts;
  const g = new THREE.Group();
  const floorH = height / floors;
  const proj = 1.1;
  const parts = [];
  const railParts = [];
  for (let f = 0; f < floors; f++) {
    const y = f * floorH;
    const landing = new THREE.BoxGeometry(width, 0.08, proj);
    landing.translate(0, y, proj / 2);
    parts.push(landing);
    const rail = new THREE.BoxGeometry(width, 0.7, 0.05);
    rail.translate(0, y + 0.35, proj - 0.02);
    railParts.push(rail);
    if (f < floors - 1) {
      const run = Math.hypot(floorH, proj * 0.8);
      const stair = new THREE.BoxGeometry(width * 0.85, 0.06, run);
      stair.rotateX(-Math.atan2(floorH, proj * 0.8));
      stair.translate(0, y + floorH / 2, proj * 0.4);
      parts.push(stair);
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(parts), material));
  g.add(new THREE.Mesh(mergeGeometries(railParts), material));
  return g;
}

/**
 * rooftopKit — randomized rooftop mechanical clutter: a water tank on a
 * steel stand, 1-3 chimney stacks, a glazed skylight monitor, and a roof
 * hatch, laid out from a deterministic seed. All parts of one material
 * merge into a single mesh, so a whole roof costs at most 3 draw calls
 * regardless of how many chimneys/hatches are randomized in.
 * @param {object} [opts]
 * @param {number} [opts.footprintW=10] roof clutter footprint width (m)
 * @param {number} [opts.footprintD=10] roof clutter footprint depth (m)
 * @param {number} [opts.seed=1] deterministic seed — same seed -> same layout
 * @param {boolean} [opts.tank=true] include the water tank
 * @returns {THREE.Group} origin at roof deck level (y=0 = deck)
 */
export function rooftopKit(opts = {}) {
  const { footprintW = 10, footprintD = 10, seed = 1, tank = true } = opts;
  const rng = rand(seed);
  const g = new THREE.Group();
  const darkParts = [];
  const terracottaParts = [];
  const glassParts = [];

  if (tank) {
    const standH = 2.2 + rng() * 1.2;
    const tankR = 1.3 + rng() * 0.6;
    const tankH = 2.0 + rng() * 1.0;
    const tx = (rng() - 0.5) * footprintW * 0.5;
    const tz = (rng() - 0.5) * footprintD * 0.5;
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const leg = new THREE.BoxGeometry(0.14, standH, 0.14);
      leg.translate(tx + lx * tankR * 0.7, standH / 2, tz + lz * tankR * 0.7);
      darkParts.push(leg);
    }
    const barrel = new THREE.CylinderGeometry(tankR, tankR, tankH, 10);
    barrel.translate(tx, standH + tankH / 2, tz);
    darkParts.push(barrel);
    const cap = new THREE.ConeGeometry(tankR * 1.05, tankH * 0.35, 10);
    cap.translate(tx, standH + tankH + (tankH * 0.35) / 2, tz);
    darkParts.push(cap);
  }

  const nChimneys = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < nChimneys; i++) {
    const cx = (rng() - 0.5) * footprintW * 0.7;
    const cz = (rng() - 0.5) * footprintD * 0.7;
    const ch = 1.4 + rng() * 1.6;
    const cw = 0.7 + rng() * 0.4;
    const stack = new THREE.BoxGeometry(cw, ch, cw);
    stack.translate(cx, ch / 2, cz);
    terracottaParts.push(stack);
    const capB = new THREE.BoxGeometry(cw + 0.24, 0.2, cw + 0.24);
    capB.translate(cx, ch + 0.1, cz);
    darkParts.push(capB);
  }

  const monW = Math.min(footprintW * 0.5, 4.5);
  const monD = Math.min(footprintD * 0.3, 2.5);
  const monH = 1.1;
  const mx = -footprintW * 0.15, mz = footprintD * 0.15;
  const base = new THREE.BoxGeometry(monW, 0.3, monD);
  base.translate(mx, 0.15, mz);
  darkParts.push(base);
  const roof1 = new THREE.BoxGeometry(monW * 0.52, 0.06, monD);
  roof1.rotateZ(0.5);
  roof1.translate(mx - monW * 0.22, 0.3 + monH * 0.4, mz);
  glassParts.push(roof1);
  const roof2 = new THREE.BoxGeometry(monW * 0.52, 0.06, monD);
  roof2.rotateZ(-0.5);
  roof2.translate(mx + monW * 0.22, 0.3 + monH * 0.4, mz);
  glassParts.push(roof2);
  const ridge = new THREE.BoxGeometry(monW + 0.1, 0.12, monD + 0.1);
  ridge.translate(mx, 0.3 + monH * 0.75, mz);
  darkParts.push(ridge);

  const hx = footprintW * 0.2, hz = -footprintD * 0.2;
  const hatch = new THREE.BoxGeometry(1.0, 0.35, 1.0);
  hatch.translate(hx, 0.18, hz);
  darkParts.push(hatch);
  const hatchLid = new THREE.BoxGeometry(1.1, 0.06, 1.1);
  hatchLid.translate(hx, 0.36, hz);
  darkParts.push(hatchLid);

  if (darkParts.length) g.add(new THREE.Mesh(mergeGeometries(darkParts), materials.steelDark));
  if (terracottaParts.length) g.add(new THREE.Mesh(mergeGeometries(terracottaParts), materials.terracotta));
  if (glassParts.length) g.add(new THREE.Mesh(mergeGeometries(glassParts), materials.glassDay));

  return g;
}

/**
 * awning — striped canvas storefront awning: a sloped fabric panel plus a
 * valance skirt, merged into one mesh using the shared striped canvas
 * texture (deco-shared.js's awningTexture) — one draw call.
 * @param {object} [opts]
 * @param {number} [opts.width=3] awning width along the storefront (m)
 * @param {number} [opts.projection=1.4] how far it projects from the wall (m)
 * @param {number} [opts.dropAngleDeg=18] downward slope angle (degrees)
 * @param {number} [opts.seed=1] reserved for future per-instance variation
 * @returns {THREE.Mesh} origin at the wall mount, wall face z=0, projects toward +Z
 */
export function awning(opts = {}) {
  const { width = 3, projection = 1.4, dropAngleDeg = 18 } = opts;
  const angle = -THREE.MathUtils.degToRad(dropAngleDeg);
  const parts = [];
  const panel = new THREE.BoxGeometry(width, 0.05, projection);
  panel.translate(0, 0, projection / 2);
  panel.rotateX(angle);
  parts.push(panel);
  const valance = new THREE.BoxGeometry(width, 0.3, 0.04);
  valance.translate(0, -0.15, projection);
  valance.rotateX(angle);
  parts.push(valance);
  const geo = mergeGeometries(parts);
  const mat = new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * shopSign — projecting bronze-bracketed "blade" sign perpendicular to a
 * storefront wall, its lettered face built via canvasSign.
 * @param {string} text sign text (period business name)
 * @param {object} [opts]
 * @param {number} [opts.width=1.6] sign panel width (m)
 * @param {number} [opts.armLength=0.5] bracket arm length off the wall (m)
 * @returns {THREE.Group} origin at the wall mount
 */
export function shopSign(text, opts = {}) {
  const { width = 1.6, armLength = 0.5 } = opts;
  const g = new THREE.Group();
  const armGeo = new THREE.BoxGeometry(armLength, 0.08, 0.08);
  armGeo.translate(armLength / 2, 0, 0);
  const plateGeo = new THREE.BoxGeometry(0.1, 0.3, 0.1);
  const bracket = new THREE.Mesh(mergeGeometries([armGeo, plateGeo]), materials.bronze);
  g.add(bracket);
  const sign = canvasSign(text, { width });
  sign.rotation.y = Math.PI / 2;
  sign.position.set(armLength + 0.02, 0, 0);
  g.add(sign);
  return g;
}
