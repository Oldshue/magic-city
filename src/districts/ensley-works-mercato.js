/**
 * src/districts/ensley-works-mercato.js
 *
 * District Architect module for "Ensley Works & Mercato" (southwest
 * industrial-port quarter of Magic City 1929): the TCI South Works furnace
 * wall beside the immigrant market quarter -- Italian, Greek, Polish and
 * Black neighborhoods, the city's loudest, most aromatic streets.
 *
 * Contract: export async function build(ctx) with
 * ctx = { THREE, scene, plan, district, materials, deco, registerInteractive }.
 * Builds only inside the ensley-works-mercato polygon. Never touches other
 * files.
 */

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function findLandmark(plan, id) {
  return plan.landmarks.find((l) => l.id === id);
}

function boxFromFootprint(position, footprint, pad) {
  const [x, z] = position;
  const [w, d] = footprint;
  const p = pad || 0;
  return {
    minX: x - w / 2 - p,
    maxX: x + w / 2 + p,
    minZ: z - d / 2 - p,
    maxZ: z + d / 2 + p,
  };
}

function overlapsAny(px, pz, w, d, boxes) {
  const halfW = w / 2 + 8;
  const halfD = d / 2 + 8;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (px + halfW > b.minX && px - halfW < b.maxX && pz + halfD > b.minZ && pz - halfD < b.maxZ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Landmark: Ensley Blast Furnace Row (real site, expanded) -- law: position,
// footprint, height from data/city-plan.json.
// ---------------------------------------------------------------------------
function buildFurnaceRow(ctx, group, lm) {
  const { THREE, materials, deco, registerInteractive } = ctx;
  const [w, d] = lm.footprint;
  const h = lm.height;
  const [x, z] = lm.position;
  const rot = degToRad(lm.rotationYDeg || 0);

  const sub = new THREE.Group();
  sub.position.set(x, 0, z);
  sub.rotation.y = rot;
  sub.name = "ensley-blast-furnace-row";

  const baseH = h * 0.32;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d * 0.62), materials.brick);
  base.position.set(0, baseH / 2, -d * 0.08);
  sub.add(base);

  const stackCount = 6;
  const stackGeo = new THREE.CylinderGeometry(3.4, 5.6, h, 12);
  const stacks = new THREE.InstancedMesh(stackGeo, materials.steelDark, stackCount);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < stackCount; i++) {
    const sx = -w / 2 + (w / (stackCount - 1)) * i;
    m4.compose(new THREE.Vector3(sx, h / 2, d * 0.18), q0, s1);
    stacks.setMatrixAt(i, m4);
  }
  stacks.instanceMatrix.needsUpdate = true;
  sub.add(stacks);

  // Furnace-throat glow at the foot of each stack -- always-lit emissive,
  // reads as the "wall of fire visible from the Belt Line".
  const glowGeo = new THREE.BoxGeometry(7.3, 2.6, 7.3);
  const glows = new THREE.InstancedMesh(glowGeo, materials.furnaceGlow, stackCount);
  for (let i = 0; i < stackCount; i++) {
    const sx = -w / 2 + (w / (stackCount - 1)) * i;
    m4.compose(new THREE.Vector3(sx, 2.6, d * 0.4), q0, s1);
    glows.setMatrixAt(i, m4);
  }
  glows.instanceMatrix.needsUpdate = true;
  sub.add(glows);

  // Catwalks binding the stacks at three levels.
  const catwalkGeo = new THREE.BoxGeometry(w - 10, 0.7, 2.2);
  const catwalks = new THREE.InstancedMesh(catwalkGeo, materials.steelDark, 3);
  [h * 0.42, h * 0.68, h * 0.92].forEach((hy, i) => {
    m4.compose(new THREE.Vector3(0, hy, d * 0.1), q0, s1);
    catwalks.setMatrixAt(i, m4);
  });
  catwalks.instanceMatrix.needsUpdate = true;
  sub.add(catwalks);

  // Diagonal pipe bracing.
  const pipeGeo = new THREE.CylinderGeometry(0.35, 0.35, h * 0.85, 6);
  const pipeCount = 10;
  const pipes = new THREE.InstancedMesh(pipeGeo, materials.steelDark, pipeCount);
  for (let i = 0; i < pipeCount; i++) {
    const px = -w / 2 + (w / pipeCount) * i + w / (pipeCount * 2);
    const tilt = (i % 2 === 0 ? 1 : -1) * 0.28;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt));
    m4.compose(new THREE.Vector3(px, h * 0.44, -d * 0.14), q, s1);
    pipes.setMatrixAt(i, m4);
  }
  pipes.instanceMatrix.needsUpdate = true;
  sub.add(pipes);

  const sign = deco.canvasSign("TCI SOUTH WORKS -- ENSLEY", { width: 32, canvasWidth: 640, canvasHeight: 128 });
  sign.position.set(0, baseH + 3, d * 0.32);
  sub.add(sign);

  // Painted advertisement mural on the works wall facing the street --
  // World Bible Voice fragment 3, verbatim.
  const mural = deco.canvasSign("MADE WHERE IT'S MINED -- TC IRON", { width: 20, canvasWidth: 512, canvasHeight: 160 });
  mural.position.set(-w * 0.3, baseH * 0.55, d * 0.32 + 0.02);
  sub.add(mural);
  registerInteractive(mural, {
    title: "Painted Advertisement -- TCI South Works Wall",
    body:
      "MADE WHERE IT'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH'S OWN METAL.",
  });

  group.add(sub);

  // Bronze plaque at the works gate -- World Bible Voice fragment 1, verbatim.
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.14), materials.bronze);
  plaque.position.set(x - w / 2 + 6, 1.4, z + d / 2 + 2.2);
  group.add(plaque);
  registerInteractive(plaque, {
    title: "Bronze Plaque -- South Works Gate",
    body:
      "WOODWARD SAYS NO. — TCI Declines Northern Bonds; 'Our Iron Will Carry Its Own Freight,' Declares President, as Syndicate of the South Rallies to the Rescue.",
  });
}

// ---------------------------------------------------------------------------
// Landmark: Mercato Public Market (invented) -- law: position, footprint,
// height from data/city-plan.json.
// ---------------------------------------------------------------------------
function buildMercatoMarket(ctx, group, lm) {
  const { THREE, materials, deco, registerInteractive } = ctx;
  const [w, d] = lm.footprint;
  const h = lm.height;
  const [x, z] = lm.position;
  const rot = degToRad(lm.rotationYDeg || 0);

  const sub = new THREE.Group();
  sub.position.set(x, 0, z);
  sub.rotation.y = rot;
  sub.name = "mercato-public-market";

  const wallH = h * 0.62;

  const front = deco.pilasterFacade({ width: w, height: wallH, bays: 8, material: materials.limestone, pilasterMaterial: materials.terracotta });
  front.position.set(0, 0, d / 2);
  sub.add(front);

  const back = deco.pilasterFacade({ width: w, height: wallH, bays: 8, material: materials.limestone, pilasterMaterial: materials.terracotta });
  back.position.set(0, 0, -d / 2);
  back.rotation.y = Math.PI;
  sub.add(back);

  const sideGeo = new THREE.BoxGeometry(0.5, wallH, d);
  const sideL = new THREE.Mesh(sideGeo, materials.brick);
  sideL.position.set(-w / 2, wallH / 2, 0);
  sub.add(sideL);
  const sideR = new THREE.Mesh(sideGeo, materials.brick);
  sideR.position.set(w / 2, wallH / 2, 0);
  sub.add(sideR);

  // Low-pitched roof over the hall.
  const roofH = h * 0.12;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, roofH, d + 1.2), materials.terracotta);
  roof.position.set(0, wallH + roofH / 2, 0);
  sub.add(roof);

  // Raised clerestory skylight monitor down the spine of the hall --
  // "vaulted skylight hall, forty-four stalls".
  const monitorH = Math.max(1.5, h - wallH - roofH);
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, monitorH, d * 0.42), materials.steelDark);
  monitor.position.set(0, wallH + roofH + monitorH / 2, 0);
  sub.add(monitor);

  const monGlassGrid = deco.windowGrid({
    rows: 1,
    cols: 10,
    spacingX: (w * 0.55) / 11,
    spacingY: monitorH * 0.6,
    width: (w * 0.55) / 11 - 0.3,
    height: monitorH * 0.55,
    material: materials.glassNight,
  });
  monGlassGrid.position.set(0, wallH + roofH + monitorH / 2, d * 0.21 + 0.05);
  sub.add(monGlassGrid);
  const monGlassGridBack = monGlassGrid.clone();
  monGlassGridBack.position.z = -(d * 0.21 + 0.05);
  monGlassGridBack.rotation.y = Math.PI;
  sub.add(monGlassGridBack);

  const doorway = deco.decoDoorway({ width: 4.2, height: wallH * 0.5, frameMaterial: materials.bronze, doorMaterial: materials.steelDark });
  doorway.position.set(0, 0, d / 2 + 0.05);
  sub.add(doorway);

  const sign = deco.canvasSign("MERCATO PUBLIC MARKET", { width: w * 0.5, canvasWidth: 640, canvasHeight: 160 });
  sign.position.set(0, wallH * 0.62, d / 2 + 0.3);
  sub.add(sign);

  // Vendor stalls and awnings along the market frontage, instanced.
  const stallCount = 10;
  const stallGeo = new THREE.BoxGeometry(3.2, 2.0, 1.6);
  const stalls = new THREE.InstancedMesh(stallGeo, materials.brick, stallCount);
  const awnGeo = new THREE.BoxGeometry(3.6, 0.2, 2.0);
  const awnings = new THREE.InstancedMesh(awnGeo, materials.terracotta, stallCount);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < stallCount; i++) {
    const sx = -w / 2 + 6 + (i * (w - 12)) / (stallCount - 1);
    m4.compose(new THREE.Vector3(sx, 1.0, d / 2 + 4.5), q0, s1);
    stalls.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(sx, 2.3, d / 2 + 4.5), q0, s1);
    awnings.setMatrixAt(i, m4);
  }
  stalls.instanceMatrix.needsUpdate = true;
  awnings.instanceMatrix.needsUpdate = true;
  sub.add(stalls);
  sub.add(awnings);

  group.add(sub);

  // Newspaper stand front page near the market entrance -- World Bible
  // Voice fragment 8, verbatim.
  const standBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.9), materials.steelDark);
  standBody.position.set(x - w / 2 - 4, 0.8, z + d / 2 + 6);
  group.add(standBody);
  const standRoof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 1.2), materials.terracotta);
  standRoof.position.set(x - w / 2 - 4, 1.7, z + d / 2 + 6);
  group.add(standRoof);
  const frontPage = deco.canvasSign("THE BIRMINGHAM LEDGER", { width: 1.8, canvasWidth: 380, canvasHeight: 200 });
  frontPage.rotation.y = Math.PI / 2;
  frontPage.position.set(x - w / 2 - 4 + 0.5, 1.1, z + d / 2 + 6);
  group.add(frontPage);
  registerInteractive(frontPage, {
    title: "Newspaper Stand -- Ledger Extra",
    body: "EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!",
  });

  // Chalkboard outside a Mercato café -- World Bible Voice fragment 9,
  // verbatim.
  const chalkboard = deco.canvasSign("CAFFÈ 5¢", { width: 1.6, canvasWidth: 380, canvasHeight: 220 });
  chalkboard.position.set(x + w / 2 + 3, 1.3, z - d / 2 - 2);
  chalkboard.rotation.y = Math.PI * 0.75;
  group.add(chalkboard);
  registerInteractive(chalkboard, {
    title: "Chalkboard -- Mercato Café",
    body: "CAFFÈ 5¢ — PANE 6¢ — FURNACE SHIFT MEN EAT FREE ON PAYDAY IF THE BOSS DOESN'T ASK WHY.",
  });
}

// ---------------------------------------------------------------------------
// Background fabric: St. Elias Greek Orthodox Church (invented, per World
// Bible district signature list; not a plan landmark, so placed with
// district-architect discretion inside the polygon).
// ---------------------------------------------------------------------------
function buildStElias(ctx, group) {
  const { THREE, materials, deco } = ctx;
  const pos = [-1000, 150];
  const sub = new THREE.Group();
  sub.position.set(pos[0], 0, pos[1]);
  sub.name = "st-elias-greek-orthodox-church";

  const bodyW = 16;
  const bodyD = 22;
  const bodyH = 11;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), materials.limestone);
  body.position.set(0, bodyH / 2, 0);
  sub.add(body);

  const narthex = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.6, bodyH * 0.55, 3.5), materials.limestone);
  narthex.position.set(0, (bodyH * 0.55) / 2, bodyD / 2 + 1.6);
  sub.add(narthex);

  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 2, 12), materials.terracotta);
  domeBase.position.set(0, bodyH + 1, 0);
  sub.add(domeBase);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), materials.bronze);
  dome.position.set(0, bodyH + 2, 0);
  sub.add(dome);

  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), materials.bronze);
  cross.position.set(0, bodyH + 2 + 2.6, 0);
  sub.add(cross);
  const crossBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.25), materials.bronze);
  crossBar.position.set(0, bodyH + 2 + 3.1, 0);
  sub.add(crossBar);

  const grid = deco.windowGrid({ rows: 2, cols: 5, spacingX: bodyW / 6, spacingY: bodyH / 3.5, width: 1.1, height: 2.4, material: materials.glassNight });
  grid.position.set(0, bodyH * 0.55, bodyD / 2 + 0.05);
  sub.add(grid);

  const doorway = deco.decoDoorway({ width: 2.6, height: 3.6, frameMaterial: materials.bronze, doorMaterial: materials.steelDark });
  doorway.position.set(0, 0, bodyD / 2 + 3.4);
  sub.add(doorway);

  const sign = deco.canvasSign("ST. ELIAS GREEK ORTHODOX CHURCH", { width: 9, canvasWidth: 640, canvasHeight: 128 });
  sign.position.set(0, bodyH * 0.4, bodyD / 2 + 3.5);
  sub.add(sign);

  group.add(sub);

  return { minX: pos[0] - bodyW / 2 - 10, maxX: pos[0] + bodyW / 2 + 10, minZ: pos[1] - bodyD / 2 - 10, maxZ: pos[1] + bodyD / 2 + 12 };
}

// ---------------------------------------------------------------------------
// Background fabric: Ensley Workers' Institute (invented night school, per
// World Bible district signature list).
// ---------------------------------------------------------------------------
function buildWorkersInstitute(ctx, group) {
  const { THREE, materials, deco } = ctx;
  const pos = [-500, 620];
  const sub = new THREE.Group();
  sub.position.set(pos[0], 0, pos[1]);
  sub.name = "ensley-workers-institute";

  const w = 22;
  const d = 14;
  const h = 13;

  const facade = deco.pilasterFacade({ width: w, height: h, bays: 5, material: materials.limestone, pilasterMaterial: materials.terracotta });
  facade.position.set(0, 0, d / 2);
  sub.add(facade);

  const bodyBack = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.brick);
  bodyBack.position.set(0, h / 2, 0);
  sub.add(bodyBack);

  const cornice = deco.corniceBox({ width: w + 1, depth: d + 1, height: 0.6, material: materials.terracotta });
  cornice.position.set(0, h, 0);
  sub.add(cornice);

  const grid = deco.windowGrid({ rows: 2, cols: 6, spacingX: w / 7, spacingY: h / 3.2, width: 1.3, height: 2.2, material: materials.glassNight });
  grid.position.set(0, h * 0.55, d / 2 + 0.06);
  sub.add(grid);

  const doorway = deco.decoDoorway({ width: 3, height: 4.2, frameMaterial: materials.bronze, doorMaterial: materials.steelDark });
  doorway.position.set(0, 0, d / 2 + 0.05);
  sub.add(doorway);

  const sign = deco.canvasSign("ENSLEY WORKERS' INSTITUTE -- NIGHT SCHOOL", { width: 14, canvasWidth: 640, canvasHeight: 128 });
  sign.position.set(0, h + 2, d / 2 + 0.2);
  sub.add(sign);

  group.add(sub);

  return { minX: pos[0] - w / 2 - 10, maxX: pos[0] + w / 2 + 10, minZ: pos[1] - d / 2 - 10, maxZ: pos[1] + d / 2 + 12 };
}

// ---------------------------------------------------------------------------
// Background fabric: tenement / shopfront rows for the immigrant quarter,
// heavily instanced for performance (mass, cornice trim, day/night windows,
// awnings each cost exactly one draw call regardless of building count).
// ---------------------------------------------------------------------------
function buildResidentialFabric(ctx, group, rand, avoidBoxes) {
  const { THREE, materials } = ctx;

  const zones = [
    { minX: -1180, maxX: -200, minZ: 90, maxZ: 230, spacingX: 130, spacingZ: 90, minW: 16, maxW: 30, minD: 14, maxD: 22, minH: 8, maxH: 16 },
    { minX: -1180, maxX: -200, minZ: 520, maxZ: 680, spacingX: 130, spacingZ: 90, minW: 16, maxW: 30, minD: 14, maxD: 22, minH: 8, maxH: 16 },
    { minX: -1180, maxX: -780, minZ: 260, maxZ: 400, spacingX: 110, spacingZ: 80, minW: 14, maxW: 24, minD: 12, maxD: 18, minH: 7, maxH: 13 },
    { minX: -560, maxX: -200, minZ: 260, maxZ: 500, spacingX: 110, spacingZ: 80, minW: 14, maxW: 26, minD: 12, maxD: 20, minH: 7, maxH: 14 },
  ];

  const instances = [];
  for (const zone of zones) {
    for (let x = zone.minX; x <= zone.maxX; x += zone.spacingX) {
      for (let z = zone.minZ; z <= zone.maxZ; z += zone.spacingZ) {
        const jx = (rand() - 0.5) * zone.spacingX * 0.4;
        const jz = (rand() - 0.5) * zone.spacingZ * 0.4;
        const px = x + jx;
        const pz = z + jz;
        const bw = zone.minW + rand() * (zone.maxW - zone.minW);
        const bd = zone.minD + rand() * (zone.maxD - zone.minD);
        const bh = zone.minH + rand() * (zone.maxH - zone.minH);
        if (overlapsAny(px, pz, bw, bd, avoidBoxes)) continue;
        instances.push({ x: px, z: pz, w: bw, d: bd, h: bh });
      }
    }
  }

  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();

  const massGeo = new THREE.BoxGeometry(1, 1, 1);
  const mass = new THREE.InstancedMesh(massGeo, materials.brick, Math.max(1, instances.length));
  const trimGeo = new THREE.BoxGeometry(1, 1, 1);
  const trim = new THREE.InstancedMesh(trimGeo, materials.terracotta, Math.max(1, instances.length));

  instances.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, b.h / 2, b.z), q0, new THREE.Vector3(b.w, b.h, b.d));
    mass.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(b.x, b.h + 0.2, b.z), q0, new THREE.Vector3(b.w + 0.6, 0.4, b.d + 0.6));
    trim.setMatrixAt(i, m4);
  });
  mass.count = instances.length;
  trim.count = instances.length;
  mass.instanceMatrix.needsUpdate = true;
  trim.instanceMatrix.needsUpdate = true;
  group.add(mass);
  group.add(trim);

  // Windows: a day-lit majority plus a scattering of glassNight instances
  // that read as lit rooms once the sky goes dark.
  const dayMatrices = [];
  const nightMatrices = [];
  instances.forEach((b) => {
    const cols = Math.max(2, Math.min(6, Math.round(b.w / 5)));
    const rows = Math.max(1, Math.min(3, Math.round(b.h / 5)));
    const spacingX = b.w / (cols + 1);
    const spacingY = b.h / (rows + 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x + (c - (cols - 1) / 2) * spacingX;
        const wy = spacingY * (r + 1);
        const mat = new THREE.Matrix4().compose(new THREE.Vector3(wx, wy, b.z + b.d / 2 + 0.05), q0, new THREE.Vector3(1, 1, 1));
        if (rand() < 0.22) nightMatrices.push(mat);
        else dayMatrices.push(mat);
      }
    }
  });

  const winGeo = new THREE.PlaneGeometry(1.3, 1.8);
  const winDay = new THREE.InstancedMesh(winGeo, materials.glassDay, Math.max(1, dayMatrices.length));
  dayMatrices.forEach((m, i) => winDay.setMatrixAt(i, m));
  winDay.count = dayMatrices.length;
  winDay.instanceMatrix.needsUpdate = true;
  group.add(winDay);

  const winNight = new THREE.InstancedMesh(winGeo, materials.glassNight, Math.max(1, nightMatrices.length));
  nightMatrices.forEach((m, i) => winNight.setMatrixAt(i, m));
  winNight.count = nightMatrices.length;
  winNight.instanceMatrix.needsUpdate = true;
  group.add(winNight);

  // Ground-floor awnings on a sample of corner shopfronts.
  const awnCount = Math.min(14, Math.max(1, Math.floor(instances.length * 0.3)));
  const awnGeo = new THREE.BoxGeometry(1, 1, 1);
  const awnings = new THREE.InstancedMesh(awnGeo, materials.terracotta, awnCount);
  for (let i = 0; i < awnCount; i++) {
    const b = instances[Math.floor(rand() * instances.length)] || { x: 0, z: 0, w: 10, d: 10 };
    m4.compose(new THREE.Vector3(b.x, 2.6, b.z + b.d / 2 + 0.9), q0, new THREE.Vector3(b.w * 0.5, 0.15, 1.6));
    awnings.setMatrixAt(i, m4);
  }
  awnings.instanceMatrix.needsUpdate = true;
  group.add(awnings);
}

// ---------------------------------------------------------------------------
// Street furniture: hero lamps + doorways at landmark thresholds (deco
// helper), instanced sidewalk lamps along frontage lines, hero period
// signage from the World Bible Texture section, crates at the loading dock.
// ---------------------------------------------------------------------------
function buildStreetFurniture(ctx, group, rand) {
  const { THREE, materials, deco } = ctx;

  const heroLampSpots = [
    [-1030, 495],
    [-900, 370],
    [-660, 340],
    [-580, 260],
    [-1000, 175],
    [-500, 605],
  ];
  heroLampSpots.forEach(([x, z]) => {
    const lamp = deco.streetlamp();
    lamp.position.set(x, 0, z);
    group.add(lamp);
  });

  const lampSpots = [];
  for (let x = -1160; x <= -220; x += 95) {
    lampSpots.push([x, 80]);
    lampSpots.push([x, 680]);
  }
  for (let z = 120; z <= 660; z += 110) {
    lampSpots.push([-1180, z]);
    lampSpots.push([-220, z]);
  }

  const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 4.6, 8);
  const globeGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const poles = new THREE.InstancedMesh(poleGeo, materials.steelDark, lampSpots.length);
  const globes = new THREE.InstancedMesh(globeGeo, materials.glassNight, lampSpots.length);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  lampSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, 2.3, z), q0, s1);
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 4.6, z), q0, s1);
    globes.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  globes.instanceMatrix.needsUpdate = true;
  group.add(poles);
  group.add(globes);

  // Hero period signs -- names and prices straight from the World Bible
  // Texture section (newspapers, radio, everyday prices, streetcar lines).
  const heroSigns = [
    { text: "ENSLEY FLYER -- DOWNTOWN", pos: [-1050, 90], rotY: Math.PI / 2 },
    { text: "THE MAGIC CITY MESSENGER -- 2c", pos: [-760, 610], rotY: 0 },
    { text: "COCA-COLA 5c", pos: [-350, 140], rotY: Math.PI / 2 },
    { text: "LUCKY STRIKES 10c", pos: [-900, 650], rotY: 0 },
  ];
  heroSigns.forEach(({ text, pos, rotY }) => {
    const sign = deco.canvasSign(text, { width: 6, canvasWidth: 512, canvasHeight: 160 });
    sign.position.set(pos[0], 3.2, pos[1]);
    sign.rotation.y = rotY;
    group.add(sign);
  });

  // Crates and barrels near the Mercato loading dock.
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crateCount = 12;
  const crates = new THREE.InstancedMesh(crateGeo, materials.brick, crateCount);
  for (let i = 0; i < crateCount; i++) {
    const cx = -660 + (rand() * 60 - 30);
    const cz = 330 + (rand() * 20 - 10);
    const sSize = 0.8 + rand() * 0.6;
    m4.compose(new THREE.Vector3(cx, sSize / 2, cz), q0, new THREE.Vector3(sSize, sSize, sSize));
    crates.setMatrixAt(i, m4);
  }
  crates.instanceMatrix.needsUpdate = true;
  group.add(crates);
}

/**
 * build -- entry point required by src/main.js's dynamic district loader.
 * @param {object} ctx { THREE, scene, plan, district, materials, deco, registerInteractive }
 * @returns {import('three').Group} the district's root group (already added to the scene)
 */
export async function build(ctx) {
  const { THREE, scene, plan, registerInteractive } = ctx;
  void registerInteractive;

  const group = new THREE.Group();
  group.name = "district:ensley-works-mercato";

  const rand = makeRng(192907);

  const furnaceLm = findLandmark(plan, "ensley-blast-furnace-row");
  const marketLm = findLandmark(plan, "mercato-public-market");

  const avoidBoxes = [];
  if (furnaceLm) {
    buildFurnaceRow(ctx, group, furnaceLm);
    avoidBoxes.push(boxFromFootprint(furnaceLm.position, furnaceLm.footprint, 20));
  }
  if (marketLm) {
    buildMercatoMarket(ctx, group, marketLm);
    avoidBoxes.push(boxFromFootprint(marketLm.position, marketLm.footprint, 25));
  }

  avoidBoxes.push(buildStElias(ctx, group));
  avoidBoxes.push(buildWorkersInstitute(ctx, group));

  buildResidentialFabric(ctx, group, rand, avoidBoxes);
  buildStreetFurniture(ctx, group, rand);

  scene.add(group);
  return group;
}
