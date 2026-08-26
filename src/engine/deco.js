/**
 * deco.js — art deco geometry helper library for Magic City 1929.
 *
 * Genuinely deco silhouettes: stepped setbacks, ziggurat crowns, finials,
 * pilaster rhythm, instanced window grids, canvas signage. Every function
 * takes an options object and returns a THREE.Object3D ready to add.
 */
import * as THREE from 'three';
import { materials } from './materials.js';

const lampGlobes = []; // registered by streetlamp(); toggled at night
const lampRecords = []; // {group, globe, disc} — full lamp records for the point-light pool

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

/**
 * windowGrid — InstancedMesh of windows laid out on an XY plane facing +Z.
 * Position/rotate the returned mesh to place it on a facade.
 * @param {object} opts
 * @param {number} opts.rows
 * @param {number} opts.cols
 * @param {number} opts.spacingX horizontal pitch (m)
 * @param {number} opts.spacingY vertical pitch (m)
 * @param {number} [opts.width=1.6]
 * @param {number} [opts.height=2.2]
 * @param {THREE.Material} [opts.material=materials.glassDay]
 * @returns {THREE.InstancedMesh} origin at grid center
 */
export function windowGrid(opts) {
  const { rows, cols, spacingX, spacingY,
          width = 1.6, height = 2.2, material = materials.glassDay } = opts;
  const count = rows * cols;
  const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(width, height), material, count);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      m.makeTranslation((c - (cols - 1) / 2) * spacingX, (r - (rows - 1) / 2) * spacingY, 0);
      inst.setMatrixAt(n++, m);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

/**
 * canvasSign — glowing marquee sign: chevron-framed panel with text drawn
 * to a CanvasTexture (no external fonts).
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.width=10] world width (m); height follows aspect
 * @param {number} [opts.canvasWidth=512]
 * @param {number} [opts.canvasHeight=128]
 * @returns {THREE.Group} plane centered at origin facing +Z
 */
export function canvasSign(text, opts = {}) {
  const { width = 10, canvasWidth = 512, canvasHeight = 128 } = opts;
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = '#b98d3e';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, canvasWidth - 20, canvasHeight - 20);
    // Chevron band along top and bottom edges.
    ctx.fillStyle = '#b98d3e';
    const step = 24;
    for (let x = 20; x < canvasWidth - 40; x += step * 2) {
      ctx.beginPath();
      ctx.moveTo(x, canvasHeight - 16); ctx.lineTo(x + step, canvasHeight - 26);
      ctx.lineTo(x + step * 2, canvasHeight - 16); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, 16); ctx.lineTo(x + step, 26);
      ctx.lineTo(x + step * 2, 16); ctx.closePath(); ctx.fill();
    }
    ctx.font = 'bold ' + Math.floor(canvasHeight * 0.42) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe6b0';
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * canvasHeight / canvasWidth), mat);
  group.add(mesh);
  group.userData.redraw = () => { draw(); texture.needsUpdate = true; };
  return group;
}

// --- Warm radial-glow disc texture for the pavement pool under each lamp --
let _glowDiscTexture = null;
function glowDiscTexture() {
  if (_glowDiscTexture) return _glowDiscTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,214,150,0.9)');
  g.addColorStop(0.5, 'rgba(255,190,110,0.35)');
  g.addColorStop(1.0, 'rgba(255,180,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _glowDiscTexture = new THREE.CanvasTexture(c);
  _glowDiscTexture.colorSpace = THREE.SRGBColorSpace;
  return _glowDiscTexture;
}

/**
 * streetlamp — period pole lamp with warm globe; globes auto-dim by day.
 * Also lays a warm glow-pool disc on the pavement beneath the lamp (opacity
 * driven by setLampsNight) and registers the lamp for the point-light pool
 * (see initLampPool/updateLampPool below) so a handful of real PointLights
 * follow the nearest lamps to the camera at night.
 * @returns {THREE.Group} base at y=0, ~5m tall
 */
export function streetlamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 4.6, 8), materials.steelDark);
  pole.position.y = 2.3;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), materials.steelDark);
  arm.position.set(0.45, 4.6, 0);
  g.add(arm);
  const globeMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), globeMat);
  globe.position.set(0.95, 4.5, 0);
  lampGlobes.push(globe);
  g.add(globe);

  // Ground glow-pool disc, laid flat, additively blended, invisible by day.
  const discMat = new THREE.MeshBasicMaterial({
    map: glowDiscTexture(), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffffff,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0.95, 0.03, 0);
  g.add(disc);

  lampRecords.push({ group: g, globe, disc });
  return g;
}

/**
 * setLampsNight — toggle all registered lamp globes (and their pavement
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

// --- Streetlamp PointLight pool: max ~8 real lights, recycled each frame to
// the lamps nearest the camera (see docs/TECH-CONTRACT.md perf budget: "one
// shadow-casting light, <=8 dynamic point lights"). Allocation-free per frame
// aside from the fixed-size scratch arrays created once below. ------------
const LAMP_POOL_SIZE = 8;
let lampPool = null;
const _poolWorldPos = new THREE.Vector3();
const _poolDistScratch = new Float64Array(LAMP_POOL_SIZE);
const _poolNearest = new Array(LAMP_POOL_SIZE).fill(null);

/**
 * initLampPool — create the recycled pool of streetlamp PointLights and add
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
 * updateLampPool — reassign the recycled PointLight pool to the streetlamps
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

/**
 * decoDoorway — bronze-framed recessed entrance with fan light above.
 * @param {object} [opts]
 * @param {number} [opts.width=3]
 * @param {number} [opts.height=4.5]
 * @param {THREE.Material} [opts.frameMaterial=materials.bronze]
 * @param {THREE.Material} [opts.doorMaterial=materials.steelDark]
 * @returns {THREE.Group} base at y=0, faces +Z
 */
export function decoDoorway(opts = {}) {
  const { width = 3, height = 4.5,
          frameMaterial = materials.bronze, doorMaterial = materials.steelDark } = opts;
  const g = new THREE.Group();
  // Recessed door slab.
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.72, 0.15), doorMaterial);
  door.position.set(0, height * 0.36, -0.25);
  g.add(door);
  // Fan-light semicircle.
  const fan = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.5, 16, 0, Math.PI), materials.marquee
  );
  fan.position.set(0, height * 0.72, -0.24);
  g.add(fan);
  // Bronze surround: two jambs + lintel + stepped crest.
  const jw = 0.22;
  for (const x of [-width / 2 - jw / 2, width / 2 + jw / 2]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jw, height, 0.3), frameMaterial);
    jamb.position.set(x, height / 2, 0);
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + jw * 2 + 0.4, 0.3, 0.3), frameMaterial);
  lintel.position.set(0, height + 0.15, 0);
  g.add(lintel);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.22, 0.3), frameMaterial);
  crest.position.set(0, height + 0.41, 0);
  g.add(crest);
  return g;
}
