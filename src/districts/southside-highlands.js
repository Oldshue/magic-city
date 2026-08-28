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
 * Densification pass (District Densifier II): the district is now filled
 * street-to-street with a citywide grid of local residential frontage
 * lines (rowsZ east-west, colsX north-south) instead of a few isolated
 * avenue/street bands, so every lot along a street reads as built or
 * deliberately gardened rather than bare lawn. Five house archetypes
 * (shotgun, bungalow, foursquare, merchant villa, small brick apartment
 * block) carry real anatomy — hip or gable roofs with eave overhang
 * (built from a CylinderGeometry frustum and a THREE.Shape/ExtrudeGeometry
 * triangular prism, not a bare pointed "hat"), brick chimneys, front
 * porches with posts and a porch roof, front steps, and facade window
 * rhythm — while staying entirely instanced so hundreds of background
 * houses cost only a handful of draw calls total. Street trees, hedges/
 * low walls between some yards, occasional back-alley sheds, and two
 * Highland touches (a second stone-and-brick apartment hotel, plus two
 * corner groceries with painted canvasSign boards) round out the block.
 *
 * Everything below is built once, at load time, and added to ctx.scene.
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

  // Zones excluded from generic infill: the mansion grounds, the existing
  // set-piece buildings, and reservations for the Tier 4 hero buildings
  // (a second apartment hotel and two corner groceries) built later below.
  const blockedZones = [
    { x0: 138, x1: 302, z0: 404, z1: 616 },   // DeLancey Mansion + fenced grounds
    { x0: 27, x1: 53, z0: 236, z1: 264 },     // Highland Court Apartments
    { x0: 84, x1: 108, z0: 296, z1: 314 },    // Corner Drug
    { x0: 496, x1: 548, z0: 436, z1: 488 },   // Ridgeway Arms apartment hotel
    { x0: 146, x1: 178, z0: 424, z1: 454 },   // Highland Grocery
    { x0: 571, x1: 609, z0: 634, z1: 666 },   // Foothill Market
  ];
  function inBlocked(x, z) {
    for (const b of blockedZones) {
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // 1. DELANCEY MANSION — the district's landmark
  // -----------------------------------------------------------------------
  function buildDelanceyMansion(lm) {
    const g = new THREE.Group();
    const [w, d] = lm.footprint;
    const h = lm.height;
    g.position.set(lm.position[0], 0, lm.position[1]);
    g.rotation.y = THREE.MathUtils.degToRad(lm.rotationYDeg || 0);

    const bodyH = h * 0.8;
    const main = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), materials.limestone);
    main.position.y = bodyH / 2;
    g.add(main);

    const parapet = deco.corniceBox({ width: w + 1.4, depth: d + 1.4, height: h - bodyH, material: materials.terracotta });
    parapet.position.y = bodyH;
    g.add(parapet);

    const portico = deco.pilasterFacade({
      width: w * 0.5, height: bodyH * 0.94, bays: 6,
      material: materials.limestone, pilasterMaterial: materials.bronze,
    });
    portico.rotation.y = Math.PI;
    portico.position.set(0, 0, -d / 2 - 0.05);
    g.add(portico);

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

    const pediment = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5 + 1.2, 1.4, 3.4), materials.terracotta);
    pediment.position.set(0, bodyH + 0.7, -d / 2 - 3.4);
    g.add(pediment);

    const fin = deco.finial({ height: 3 });
    fin.position.set(0, bodyH + 1.4, -d / 2 - 3.4);
    g.add(fin);

    const doorway = deco.decoDoorway({ width: 3.4, height: 5 });
    doorway.rotation.y = Math.PI;
    doorway.position.set(0, 0, -d / 2 - 3.6);
    g.add(doorway);

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
  apartments.position.set(40, 0, 420);
  group.add(apartments);
  const apartmentSign = deco.canvasSign('HIGHLAND COURT', { width: 8 });
  apartmentSign.position.set(40, 6, 429.2);
  group.add(apartmentSign);

  // -----------------------------------------------------------------------
  // 3. CORNER DRUGSTORE — small commercial anchor near 2nd Ave S & 19th
  // -----------------------------------------------------------------------
  const drugX = 96, drugZ = 425;
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
  // 4. RESIDENTIAL FABRIC — dense, five-archetype, instanced period fill
  // -----------------------------------------------------------------------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const colGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

  // Hip roof: a 4-sided cylinder frustum, centered at local y=0 (spans
  // -0.5..+0.5 before scale), reading as a real overhanging hip roof.
  const hipRoofGeo = new THREE.CylinderGeometry(0.16, 0.72, 1, 4, 1);
  hipRoofGeo.rotateY(Math.PI / 4);

  // Gable roof: a triangular-prism ridge (Shape + ExtrudeGeometry, core
  // three.js — not a new engine helper). NOTE this geometry is NOT
  // vertically centered like the hip frustum above: local y runs 0 (the
  // two eave/base corners) .. 1 (the ridge apex), so callers must anchor
  // it at the wall-top y, not at wall-top + half roof height.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-0.5, 0);
  gableShape.lineTo(0.5, 0);
  gableShape.lineTo(0, 1);
  gableShape.lineTo(-0.5, 0);
  const gableRoofGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  gableRoofGeo.translate(0, 0, -0.5);
  gableRoofGeo.computeVertexNormals();

  const ARCH = {
    shotgun: { w: 6.5, d: 15, h: 4.6, roofType: 'gable', roofH: 2.4, porch: 2, winCols: 1, twoStory: false, wallOptions: ['brick'] },
    bungalow: { w: 9.2, d: 9.6, h: 5.4, roofType: 'hip', roofH: 2.2, porch: 3, winCols: 2, twoStory: false, wallOptions: ['brick', 'limestone'] },
    foursquare: { w: 11.5, d: 11.5, h: 9.2, roofType: 'hip', roofH: 3.0, porch: 3, winCols: 3, twoStory: true, wallOptions: ['brick', 'limestone'] },
    merchant: { w: 14, d: 12.5, h: 9.6, roofType: 'hip', roofH: 2.6, porch: 4, winCols: 4, twoStory: true, wallOptions: ['limestone'] },
    apartmentblock: { w: 17, d: 13, h: 11.5, roofType: 'hip', roofH: 2.4, porch: 2, winCols: 5, twoStory: true, wallOptions: ['brick'] },
  };

  function archetypeKeyFor(z) {
    if (z < 302) return Math.random() < 0.58 ? 'shotgun' : (Math.random() < 0.55 ? 'bungalow' : 'apartmentblock');
    if (z < 412) return Math.random() < 0.5 ? 'foursquare' : (Math.random() < 0.55 ? 'bungalow' : 'merchant');
    if (z < 612) return Math.random() < 0.62 ? 'merchant' : 'foursquare';
    return Math.random() < 0.55 ? 'bungalow' : (Math.random() < 0.5 ? 'foursquare' : 'shotgun');
  }
  function gardenChanceFor(z) { return (z >= 412 && z < 612) ? 0.32 : 0.09; }

  const wallsLimestone = [];
  const wallsBrick = [];
  const roofsHip = [];
  const roofsGable = [];
  const chimneys = [];
  const porchCols = [];
  const porchRoofs = [];
  const steps = [];
  const doors = [];
  const winsDay = [];
  const winsNight = [];
  const hedges = [];
  const canopyMatrices = []; // garden shrubs (Section 4) + street trees (Section 5) share one pool

  const placed = [];
  function tooClose(x, z) {
    const min2 = 64; // 8m
    for (let i = 0; i < placed.length; i++) {
      const dx = placed[i][0] - x, dz = placed[i][1] - z;
      if (dx * dx + dz * dz < min2) return true;
    }
    return false;
  }

  function addGarden(x, z, rotY) {
    // Deliberate lot use where a house is skipped: a low front hedge and a
    // pair of ornamental shrubs instead of bare lawn.
    const front = localToWorld(x, z, rotY, 0, 3.4);
    hedges.push(mat4(front.x, 0.5, front.z, rotY, 4.6, 1.0, 0.6));
    const shrubA = localToWorld(x, z, rotY, -2.6, 5.6);
    const shrubB = localToWorld(x, z, rotY, 2.6, 5.6);
    canopyMatrices.push(mat4(shrubA.x, 1.1, shrubA.z, 0, 0.5, 0.5, 0.5));
    canopyMatrices.push(mat4(shrubB.x, 1.1, shrubB.z, 0, 0.5, 0.5, 0.5));
  }

  function addHouse(x, z, rotY) {
    if (!insidePoly(x, z) || inBlocked(x, z) || tooClose(x, z)) return;
    if (Math.random() < gardenChanceFor(z)) { addGarden(x, z, rotY); placed.push([x, z]); return; }

    const key = archetypeKeyFor(z);
    const a = ARCH[key];
    const wallKey = a.wallOptions[Math.floor(Math.random() * a.wallOptions.length)];
    const jitter = 0.9 + Math.random() * 0.22;
    const w = a.w * jitter, d = a.d * jitter, h = a.h * (0.94 + Math.random() * 0.12);

    (wallKey === 'limestone' ? wallsLimestone : wallsBrick).push(mat4(x, h / 2, z, rotY, w, h, d));

    if (a.roofType === 'gable') {
      // gableRoofGeo's base sits at local y=0 (see note above), so the
      // anchor y is the wall top itself, not wall-top + half roof height.
      roofsGable.push(mat4(x, h, z, rotY, w * 1.16, a.roofH, d * 1.08));
    } else {
      roofsHip.push(mat4(x, h + a.roofH / 2, z, rotY, w * 1.18, a.roofH, d * 1.18));
    }

    const chim = localToWorld(x, z, rotY, w * 0.3, -d * 0.28);
    chimneys.push(mat4(chim.x, h + a.roofH * 0.8, chim.z, rotY, 0.5, a.roofH * 1.6 + 1.0, 0.5));

    const front = localToWorld(x, z, rotY, 0, d / 2 + 1.3);
    porchRoofs.push(mat4(front.x, h * 0.72, front.z, rotY, w * 0.68, 0.22, 2.6));
    const colSpan = w * 0.56;
    for (let i = 0; i < a.porch; i++) {
      const cx = a.porch === 1 ? 0 : -colSpan / 2 + (colSpan / (a.porch - 1)) * i;
      const cp = localToWorld(x, z, rotY, cx, d / 2 + 2.3);
      porchCols.push(mat4(cp.x, h * 0.36, cp.z, rotY, 0.26, h * 0.72, 0.26));
    }

    const stepP = localToWorld(x, z, rotY, 0, d / 2 + 3.5);
    steps.push(mat4(stepP.x, 0.16, stepP.z, rotY, 1.8, 0.32, 1.0));

    const dp = localToWorld(x, z, rotY, 0, d / 2 + 0.05);
    doors.push(mat4(dp.x, 1.4, dp.z, rotY, 1.15, 2.5, 0.12));

    const winCols = a.winCols;
    const lit = Math.random() < 0.24;
    for (let i = 0; i < winCols; i++) {
      const wx = -w / 2 + (w / (winCols + 1)) * (i + 1);
      const wp = localToWorld(x, z, rotY, wx, d / 2 + 0.06);
      const wy1 = h * (a.twoStory ? 0.72 : 0.6);
      (lit && i % 2 === 0 ? winsNight : winsDay).push(mat4(wp.x, wy1, wp.z, rotY, 1.25, 1.8, 0.05));
      if (a.twoStory) {
        (lit && i % 3 === 0 ? winsNight : winsDay).push(mat4(wp.x, h * 0.32, wp.z, rotY, 1.25, 1.7, 0.05));
      }
    }

    placed.push([x, z]);
  }

  // Local east-west residential streets across the whole district, plus
  // north-south cross streets, together filling every block interior.
  const rowsZ = [];
  for (let z = 254; z <= 686; z += 42) rowsZ.push(z);
  const colsX = [];
  for (let x = -136; x <= 596; x += 58) colsX.push(x);

  for (const rz of rowsZ) {
    for (let x = -150; x <= 610; x += 30) {
      const jx = x + (Math.random() - 0.5) * 8;
      addHouse(jx, rz - (9 + Math.random() * 6), 0);
      addHouse(jx, rz + (9 + Math.random() * 6), Math.PI);
    }
  }
  for (const cx of colsX) {
    for (let z = 236; z <= 686; z += 32) {
      const jz = z + (Math.random() - 0.5) * 8;
      addHouse(cx - (9 + Math.random() * 6), jz, -Math.PI / 2);
      addHouse(cx + (9 + Math.random() * 6), jz, Math.PI / 2);
    }
  }

  buildInstanced(wallsLimestone, unitBox, materials.limestone);
  buildInstanced(wallsBrick, unitBox, materials.brick);
  buildInstanced(roofsHip, hipRoofGeo, materials.terracotta);
  buildInstanced(roofsGable, gableRoofGeo, materials.steelDark);
  buildInstanced(chimneys, unitBox, materials.brick);
  buildInstanced(porchCols, colGeo, materials.limestone);
  buildInstanced(porchRoofs, unitBox, materials.terracotta);
  buildInstanced(steps, unitBox, materials.sidewalk);
  buildInstanced(doors, unitBox, materials.bronze);
  buildInstanced(winsDay, unitBox, materials.glassDay);
  buildInstanced(winsNight, unitBox, materials.glassNight);
  buildInstanced(hedges, unitBox, materials.foliage);

  // Low garden walls between a scatter of yards along the cross streets
  // (in addition to the hedge-lot gardens above), reusing the same thin
  // box geometry as a short limestone curb-wall run.
  const lowWalls = [];
  for (const cx of colsX) {
    for (let z = 240; z <= 682; z += 64) {
      if (Math.random() > 0.4) continue;
      const wx = cx + (Math.random() < 0.5 ? -14 : 14);
      if (!insidePoly(wx, z) || inBlocked(wx, z)) continue;
      lowWalls.push(mat4(wx, 0.4, z, 0, 0.3, 0.8, 6));
    }
  }
  buildInstanced(lowWalls, unitBox, materials.limestone);

  // Occasional back-alley sheds behind the house rows — small utility
  // outbuildings with a flat cap roof, sparse and unobtrusive.
  const shedWalls = [];
  const shedRoofs = [];
  for (const rz of rowsZ) {
    for (let x = -150; x <= 610; x += 34) {
      if (Math.random() > 0.28) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const sx = x + (Math.random() - 0.5) * 10;
      const sz = rz + side * (22 + Math.random() * 6);
      if (!insidePoly(sx, sz) || inBlocked(sx, sz)) continue;
      const rot = Math.random() * Math.PI;
      shedWalls.push(mat4(sx, 1.1, sz, rot, 2.6, 2.2, 2.4));
      shedRoofs.push(mat4(sx, 2.32, sz, rot, 3.0, 0.16, 2.8));
    }
  }
  buildInstanced(shedWalls, unitBox, materials.brick);
  buildInstanced(shedRoofs, unitBox, materials.steelDark);

  // -----------------------------------------------------------------------
  // 5. STREET GREEN — shaded oaks, streetlamps, benches
  // -----------------------------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.36, 3.4, 6);
  const canopyGeo = new THREE.SphereGeometry(2.4, 8, 6);
  const trunks = [];
  for (const rz of rowsZ) {
    for (let x = -150; x <= 610; x += 24) {
      const tz = rz + (Math.random() < 0.5 ? -18 : 18);
      const tx = x + (Math.random() - 0.5) * 5;
      if (!insidePoly(tx, tz) || inBlocked(tx, tz)) continue;
      trunks.push(mat4(tx, 1.7, tz, 0, 1, 1, 1));
      canopyMatrices.push(mat4(tx, 4.4, tz, 0, 1, 1, 1));
    }
  }
  buildInstanced(trunks, trunkGeo, materials.brick);
  buildInstanced(canopyMatrices, canopyGeo, materials.foliage);

  const lampSpots = [
    [120, 360], [240, 360], [120, 440], [450, 440],
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
  // 6. HIGHLAND TOUCHES — a second stone-and-brick apartment hotel near
  //    Highland Avenue, plus two corner groceries with painted signboards.
  // -----------------------------------------------------------------------
  const ridgeway = deco.setbackTower({
    width: 24, depth: 20, height: 34, setbacks: 1,
    material: materials.brick, windowMaterial: materials.glassNight,
  });
  ridgeway.position.set(522, 0, 462);
  group.add(ridgeway);
  const ridgewayTrim = deco.pilasterFacade({ width: 24, height: 6, bays: 6, material: materials.limestone, pilasterMaterial: materials.terracotta });
  ridgewayTrim.position.set(522, 0, 462 + 10.02);
  group.add(ridgewayTrim);
  const ridgewaySign = deco.canvasSign('RIDGEWAY ARMS', { width: 9 });
  ridgewaySign.position.set(522, 8.4, 462 + 10.1);
  group.add(ridgewaySign);

  function buildCornerGrocery(x, z, label) {
    const facade = deco.pilasterFacade({ width: 10, height: 6.4, bays: 3, material: materials.brick, pilasterMaterial: materials.limestone });
    facade.rotation.y = Math.PI;
    facade.position.set(x, 0, z);
    group.add(facade);

    const door = deco.decoDoorway({ width: 2.2, height: 3.2 });
    door.rotation.y = Math.PI;
    door.position.set(x, 0, z - 0.4);
    group.add(door);

    const sign = deco.canvasSign(label, { width: 6.2 });
    sign.rotation.y = Math.PI;
    sign.position.set(x, 4.6, z - 0.42);
    group.add(sign);

    const win = deco.windowGrid({ rows: 1, cols: 3, spacingX: 2.4, spacingY: 1, width: 1.5, height: 2.0, material: materials.glassNight });
    win.rotation.y = Math.PI;
    win.position.set(x, 3.5, z - 0.42);
    group.add(win);
  }
  buildCornerGrocery(162, 439, 'HIGHLAND GROCERY');
  buildCornerGrocery(590, 650, 'FOOTHILL MARKET');

  // -----------------------------------------------------------------------
  // 7. READABLES — verbatim World Bible Voice fragments (press E in-game)
  // -----------------------------------------------------------------------

  const standBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.6), materials.steelDark);
  standBox.position.set(112, 0.65, 436);
  group.add(standBox);
  const standBoard = deco.canvasSign('THE BIRMINGHAM LEDGER', { width: 1.6 });
  standBoard.rotation.y = Math.PI / 2;
  standBoard.position.set(112.7, 1.5, 436);
  group.add(standBoard);
  registerInteractive(standBoard, {
    title: 'Ledger Newsstand — Extra Edition',
    body: "EXTRA! BARONS TAKE THE SOUTHERN PENNANT — CROWDS PACK RICKWOOD FIELD! LEDGER, TWO CENTS!",
  });

  const adPanel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), materials.terracotta);
  adPanel.position.set(80, 6, 424);
  adPanel.rotation.y = Math.PI;
  group.add(adPanel);
  registerInteractive(adPanel, {
    title: 'Painted Advertisement — TC Iron',
    body: "MADE WHERE IT'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, and fire. TC IRON — THE SOUTH'S OWN METAL.",
  });

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
