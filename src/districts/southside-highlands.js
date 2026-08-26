/**
 * southside-highlands.js — District Architect module for Magic City 1929.
 *
 * SOUTHSIDE HIGHLANDS — the genteel foothill slope below Red Mountain:
 * Highland Avenue mansions, shaded boulevards, boarding houses; the
 * transition zone between the Heaviest Corner's canyon and the mountain
 * parks (World Bible §2 "wealth & power", §4 landmark table; CITY-PLAN.md
 * "southside-highlands"). Landmark: DeLancey Mansion, the columned
 * baronial pile of Colonel Ransom Beekman DeLancey, TCI chairman, forty
 * rooms crowning Highland Avenue.
 *
 * District polygon (data/city-plan.json): [[-160,220],[620,220],[620,700],[-160,700]]
 *
 * Everything below is built once, at load time, and added to ctx.scene.
 * Repeated fabric (walls, roofs, porch columns, doors, windows, trees) is
 * assembled into a handful of InstancedMesh draw calls so hundreds of
 * background structures cost only a few draw calls total.
 */

export async function build(ctx) {
  const { THREE, scene, plan, district, materials, deco, registerInteractive } = ctx;

  const group = new THREE.Group();
  group.name = 'district-southside-highlands';
  scene.add(group);

  const poly = district.polygon;
  const dummy = new THREE.Object3D();

  function insidePoly(x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const hit = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  // Compose a translate+rotateY+scale matrix for instancing.
  function mat4(x, y, z, rotY, sx, sy, sz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }

  // Rotate a local (facade-relative) offset into world XZ by rotY, add house center.
  function localToWorld(hx, hz, rotY, lx, lz) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return { x: hx + lx * c + lz * s, z: hz - lx * s + lz * c };
  }

  function buildInstanced(matrices, geometry, material) {
    if (!matrices.length) return null;
    const inst = new THREE.InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
    return inst;
  }

  // DeLancey Mansion + front lawn, excluded from generic infill.
  const inMansionZone = (x, z) => x > 140 && x < 300 && z > 410 && z < 610;

  // -----------------------------------------------------------------------
  // 1. DELANCEY MANSION — the district's landmark
  // -----------------------------------------------------------------------
  function buildDelanceyMansion(lm) {
    const g = new THREE.Group();
    const [w, d] = lm.footprint;
    const h = lm.height;
    g.position.set(lm.position[0], 0, lm.position[1]);
    g.rotation.y = THREE.MathUtils.degToRad(lm.rotationYDeg || 0);

    // Principal block.
    const bodyH = h * 0.8;
    const main = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), materials.limestone);
    main.position.y = bodyH / 2;
    g.add(main);

    const parapet = deco.corniceBox({ width: w + 1.4, depth: d + 1.4, height: h - bodyH, material: materials.terracotta });
    parapet.position.y = bodyH;
    g.add(parapet);

    // Front portico, facing -Z toward Highland Avenue.
    const portico = deco.pilasterFacade({
      width: w * 0.5, height: bodyH * 0.94, bays: 6,
      material: materials.limestone, pilasterMaterial: materials.bronze,
    });
    portico.rotation.y = Math.PI;
    portico.position.set(0, 0, -d / 2 - 0.05);
    g.add(portico);

    // Free-standing colonnade in front of the portico.
    const colCount = 6;
    const colGeo = new THREE.CylinderGeometry(0.5, 0.6, bodyH * 0.82, 12);
    const cols = new THREE.InstancedMesh(colGeo, materials.limestone, colCount);
    const span = w * 0.42;
    for (let i = 0; i < colCount; i++) {
      const x = -span / 2 + (span / (colCount - 1)) * i;
      cols.setMatrixAt(i, mat4(x, bodyH * 0.41, -d / 2 - 3.4, 0, 1, 1, 1));
    }
    cols.instanceMatrix.needsUpdate = true;
    g.add(cols);

    // Pediment slab over the colonnade, and a bronze finial atop it.
    const pediment = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5 + 1.2, 1.4, 3.4), materials.terracotta);
    pediment.position.set(0, bodyH + 0.7, -d / 2 - 3.4);
    g.add(pediment);

    const fin = deco.finial({ height: 3 });
    fin.position.set(0, bodyH + 1.4, -d / 2 - 3.4);
    g.add(fin);

    // Grand entrance.
    const doorway = deco.decoDoorway({ width: 3.4, height: 5 });
    doorway.rotation.y = Math.PI;
    doorway.position.set(0, 0, -d / 2 - 3.6);
    g.add(doorway);

    // Windows: front bank in day glass, sides in accent night glass so the
    // mansion always reads as occupied after dark.
    const frontWin = deco.windowGrid({ rows: 2, cols: 8, spacingX: w / 9, spacingY: 3.4, width: 1.5, height: 2.3, material: materials.glassDay });
    frontWin.rotation.y = Math.PI;
    frontWin.position.set(0, bodyH * 0.56, -d / 2 - 0.08);
    g.add(frontWin);

    const sideOpts = { rows: 2, cols: 5, spacingX: d / 6, spacingY: 3.4, width: 1.4, height: 2.1, material: materials.glassNight };
    const sideWinL = deco.windowGrid(sideOpts);
    sideWinL.rotation.y = Math.PI / 2;
    sideWinL.position.set(-w / 2 - 0.08, bodyH * 0.56, 0);
    g.add(sideWinL);

    const sideWinR = deco.windowGrid(sideOpts);
    sideWinR.rotation.y = -Math.PI / 2;
    sideWinR.position.set(w / 2 + 0.08, bodyH * 0.56, 0);
    g.add(sideWinR);

    // Single-story service wings, east & west.
    const wingW = w * 0.24, wingD = d * 0.6, wingH = bodyH * 0.5;
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, wingD), materials.limestone);
      wing.position.set(side * (w / 2 + wingW / 2 - 0.5), wingH / 2, 1);
      g.add(wing);
      const wingWin = deco.windowGrid({ rows: 1, cols: 3, spacingX: wingW / 4, spacingY: 1, width: 1.2, height: 1.7, material: materials.glassDay });
      wingWin.rotation.y = Math.PI;
      wingWin.position.set(side * (w / 2 + wingW / 2 - 0.5), wingH * 0.62, 1 - wingD / 2 - 0.06);
      g.add(wingWin);
    }

    // Iron fence and gate posts along the Highland Avenue frontage.
    const fenceZ = -d / 2 - 24;
    const fenceRail = new THREE.Mesh(new THREE.BoxGeometry(w + 30, 1.1, 0.15), materials.bronze);
    fenceRail.position.set(0, 0.55, fenceZ);
    g.add(fenceRail);
    const postCount = 10;
    const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6);
    const posts = new THREE.InstancedMesh(postGeo, materials.bronze, postCount);
    for (let i = 0; i < postCount; i++) {
      const x = -((w + 30) / 2) + ((w + 30) / (postCount - 1)) * i;
      posts.setMatrixAt(i, mat4(x, 0.8, fenceZ, 0, 1, 1, 1));
    }
    posts.instanceMatrix.needsUpdate = true;
    g.add(posts);

    const gatePostGeo = new THREE.CylinderGeometry(0.3, 0.32, 2.4, 8);
    for (const gx of [-3, 3]) {
      const gp = new THREE.Mesh(gatePostGeo, materials.limestone);
      gp.position.set(gx, 1.2, fenceZ);
      g.add(gp);
    }

    // Small bronze name plate by the door (decorative, not a registered readable).
    const nameplate = deco.canvasSign('DELANCEY', { width: 2.2 });
    nameplate.rotation.y = Math.PI;
    nameplate.position.set(2.4, 2.2, -d / 2 - 3.62);
    g.add(nameplate);

    return g;
  }

  const mansionPlan = plan.landmarks.find((l) => l.id === 'delancey-mansion');
  if (mansionPlan) group.add(buildDelanceyMansion(mansionPlan));

  // -----------------------------------------------------------------------
  // 2. HIGHLAND COURT APARTMENTS — transitional mid-rise near the Corner
  // -----------------------------------------------------------------------
  const apartments = deco.setbackTower({
    width: 18, depth: 18, height: 42, setbacks: 1,
    material: materials.limestone, windowMaterial: materials.glassNight,
  });
  apartments.position.set(40, 0, 250);
  group.add(apartments);
  const apartmentSign = deco.canvasSign('HIGHLAND COURT', { width: 8 });
  apartmentSign.position.set(40, 6, 259.2);
  group.add(apartmentSign);

  // -----------------------------------------------------------------------
  // 3. CORNER DRUGSTORE — small commercial anchor near 2nd Ave S & 19th
  // -----------------------------------------------------------------------
  const drugX = 96, drugZ = 305;
  const drugFacade = deco.pilasterFacade({ width: 12, height: 7.5, bays: 4, material: materials.brick, pilasterMaterial: materials.terracotta });
  drugFacade.rotation.y = Math.PI;
  drugFacade.position.set(drugX, 0, drugZ);
  group.add(drugFacade);

  const drugDoor = deco.decoDoorway({ width: 2.6, height: 3.6 });
  drugDoor.rotation.y = Math.PI;
  drugDoor.position.set(drugX, 0, drugZ - 0.4);
  group.add(drugDoor);

  const drugSign = deco.canvasSign('CORNER DRUG · SODA 5¢', { width: 7 });
  drugSign.rotation.y = Math.PI;
  drugSign.position.set(drugX, 5.6, drugZ - 0.42);
  group.add(drugSign);

  const drugWin = deco.windowGrid({ rows: 1, cols: 4, spacingX: 2.6, spacingY: 1, width: 1.8, height: 2.4, material: materials.glassNight });
  drugWin.rotation.y = Math.PI;
  drugWin.position.set(drugX, 4.4, drugZ - 0.42);
  group.add(drugWin);

  // -----------------------------------------------------------------------
  // 4. RESIDENTIAL FABRIC — instanced boarding houses, merchant homes,
  //    Highland Avenue villas and foothill bungalows, banded by z (south
  //    = closer to the mountain, per the district's genteel-slope character).
  // -----------------------------------------------------------------------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  const colGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

  const wallsLimestone = [];
  const wallsBrick = [];
  const roofs = [];
  const porchCols = [];
  const porchRoofs = [];
  const doors = [];
  const winsDay = [];
  const winsNight = [];

  function archetypeFor(z) {
    if (z < 300) return { w: 12.5, d: 10.5, h: 12, wallKey: 'brick', porch: 2, roofH: 2.6, kind: 'boarding' };
    if (z < 440) return { w: 11, d: 10, h: 8.5, wallKey: Math.random() < 0.5 ? 'limestone' : 'brick', porch: 2, roofH: 2.1, kind: 'merchant' };
    if (z < 580) return { w: 15, d: 12.5, h: 9.5, wallKey: 'limestone', porch: 4, roofH: 2.4, kind: 'grand' };
    return { w: 9, d: 8.5, h: 5.2, wallKey: 'brick', porch: 3, roofH: 1.6, kind: 'bungalow' };
  }

  function addHouse(x, z, rotY) {
    if (!insidePoly(x, z) || inMansionZone(x, z)) return;
    const a = archetypeFor(z);

    // Walls.
    const wallM = mat4(x, a.h / 2, z, rotY, a.w, a.h, a.d);
    (a.wallKey === 'limestone' ? wallsLimestone : wallsBrick).push(wallM);

    // Hip roof.
    roofs.push(mat4(x, a.h + a.roofH / 2, z, rotY, a.w * 1.05, a.roofH, a.d * 1.05));

    // Porch: shallow roof + columns on the street-facing (+Z local) side.
    const front = localToWorld(x, z, rotY, 0, a.d / 2 + 1.4);
    porchRoofs.push(mat4(front.x, a.h * 0.72, front.z, rotY, a.w * 0.62, 0.25, 2.6));
    const colSpan = a.w * 0.5;
    for (let i = 0; i < a.porch; i++) {
      const cx = a.porch === 1 ? 0 : -colSpan / 2 + (colSpan / (a.porch - 1)) * i;
      const cp = localToWorld(x, z, rotY, cx, a.d / 2 + 2.4);
      porchCols.push(mat4(cp.x, a.h * 0.36, cp.z, rotY, 0.28, a.h * 0.72, 0.28));
    }

    // Door, centered on the facade.
    const dp = localToWorld(x, z, rotY, 0, a.d / 2 + 0.05);
    doors.push(mat4(dp.x, 1.4, dp.z, rotY, 1.2, 2.6, 0.12));

    // Windows across the front facade; some lit for night ambience.
    const winCols = a.kind === 'grand' ? 4 : a.kind === 'bungalow' ? 2 : 3;
    const lit = Math.random() < 0.22;
    for (let i = 0; i < winCols; i++) {
      const wx = -a.w / 2 + (a.w / (winCols + 1)) * (i + 1);
      const wp = localToWorld(x, z, rotY, wx, a.d / 2 + 0.06);
      const wy = a.kind === 'bungalow' ? a.h * 0.62 : a.h * 0.68;
      const target = lit && i % 2 === 0 ? winsNight : winsDay;
      target.push(mat4(wp.x, wy, wp.z, rotY, 1.3, 1.8, 0.05));
      if (a.h > 9) {
        winsDay.push(mat4(wp.x, a.h * 0.3, wp.z, rotY, 1.3, 1.7, 0.05));
      }
    }
  }

  // Rows facing the three east-west avenues that cross the district.
  const avenues = [290, 440, 580];
  for (const az of avenues) {
    for (let x = -140; x <= 600; x += 30) {
      const jx = x + (Math.random() - 0.5) * 6;
      addHouse(jx, az - (13 + Math.random() * 3), 0);       // north side, faces south toward avenue
      addHouse(jx, az + (13 + Math.random() * 3), Math.PI); // south side, faces north toward avenue
    }
  }

  // Rows facing the north-south cross streets (19th, 18th, 15th).
  const crossStreets = [120, 240, 600];
  for (const cx of crossStreets) {
    for (let z = 230; z <= 690; z += 34) {
      const jz = z + (Math.random() - 0.5) * 6;
      addHouse(cx - (13 + Math.random() * 3), jz, -Math.PI / 2); // west side, faces east toward street
      addHouse(cx + (13 + Math.random() * 3), jz, Math.PI / 2);  // east side, faces west toward street
    }
  }

  buildInstanced(wallsLimestone, unitBox, materials.limestone);
  buildInstanced(wallsBrick, unitBox, materials.brick);
  buildInstanced(roofs, roofGeo, materials.steelDark);
  buildInstanced(porchCols, colGeo, materials.limestone);
  buildInstanced(porchRoofs, unitBox, materials.terracotta);
  buildInstanced(doors, unitBox, materials.bronze);
  buildInstanced(winsDay, unitBox, materials.glassDay);
  buildInstanced(winsNight, unitBox, materials.glassNight);

  // -----------------------------------------------------------------------
  // 5. STREET FURNITURE — shaded oaks, streetlamps, benches
  // -----------------------------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.36, 3.4, 6);
  const canopyGeo = new THREE.SphereGeometry(2.4, 8, 6);
  const trunks = [], canopies = [];
  for (const az of avenues) {
    for (let x = -150; x <= 610; x += 22) {
      const tz = az + (Math.random() < 0.5 ? -20 : 20);
      const tx = x + (Math.random() - 0.5) * 4;
      if (!insidePoly(tx, tz) || inMansionZone(tx, tz)) continue;
      trunks.push(mat4(tx, 1.7, tz, 0, 1, 1, 1));
      canopies.push(mat4(tx, 4.4, tz, 0, 1, 1, 1));
    }
  }
  buildInstanced(trunks, trunkGeo, materials.brick);
  buildInstanced(canopies, canopyGeo, materials.foliage);

  const lampSpots = [
    [120, 290], [240, 290], [120, 440], [450, 440],
    [600, 440], [120, 580], [450, 580], [186, 438],
  ];
  for (const [lx, lz] of lampSpots) {
    if (!insidePoly(lx, lz)) continue;
    const lamp = deco.streetlamp();
    lamp.position.set(lx, 0, lz);
    group.add(lamp);
  }

  const benchGeo = new THREE.BoxGeometry(1.6, 0.45, 0.5);
  const benchSpots = [[126, 296], [246, 296], [456, 446], [130, 586]].filter(([x, z]) => insidePoly(x, z));
  const benches = benchSpots.map(([x, z]) => mat4(x, 0.3, z, 0, 1, 1, 1));
  buildInstanced(benches, benchGeo, materials.terracotta);

  // -----------------------------------------------------------------------
  // 6. READABLES — verbatim World Bible Voice fragments (press E in-game)
  // -----------------------------------------------------------------------

  // Newspaper stand front page.
  const standBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.6), materials.steelDark);
  standBox.position.set(112, 0.65, 296);
  group.add(standBox);
  const standBoard = deco.canvasSign('THE BIRMINGHAM LEDGER', { width: 1.6 });
  standBoard.rotation.y = Math.PI / 2;
  standBoard.position.set(112.7, 1.5, 296);
  group.add(standBoard);
  registerInteractive(standBoard, {
    title: 'Ledger Newsstand — Extra Edition',
    body: "EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!",
  });

  // Painted advertisement on a boarding-house gable wall.
  const adPanel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), materials.terracotta);
  adPanel.position.set(80, 6, 304);
  adPanel.rotation.y = Math.PI;
  group.add(adPanel);
  registerInteractive(adPanel, {
    title: 'Painted Advertisement — TC Iron',
    body: "MADE WHERE IT'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH'S OWN METAL.",
  });

  // Bronze overlook plaque along Highland Avenue, facing south toward the mountain.
  const plaqueBacking = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.15), materials.bronze);
  plaqueBacking.position.set(470, 1.1, 438);
  group.add(plaqueBacking);
  const plaqueFace = deco.canvasSign('SENTINEL OF THE VALLEY', { width: 1.5 });
  plaqueFace.position.set(470, 1.1, 438.09);
  group.add(plaqueFace);
  registerInteractive(plaqueFace, {
    title: 'Bronze Overlook Plaque, Highland Avenue',
    body: "CAST OF SLOSS NO. 2 PIG IRON FOR THE ST. LOUIS FAIR, 1904. RAISED TO THE SUMMIT BY THE PEOPLE'S SENTINEL FUND, 1922. HE FACES THE FURNACES THAT MADE HIM.",
  });
}
