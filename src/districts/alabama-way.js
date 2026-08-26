/**
 * src/districts/alabama-way.js
 *
 * THE ALABAMA WAY — Second Avenue North theatre & radio district.
 * Movie palaces, vaudeville, radio studios, nightclubs; matinee crowds,
 * marquee bulbs, and a Wurlitzer drifting through propped stage doors.
 *
 * Builds strictly inside the alabama-way polygon from data/city-plan.json:
 * x in [220,620], z in [-320,220]. Landmarks (Alabama Theatre, Club Savoy)
 * use plan-mandated position/footprint/height. Background fabric, the
 * WBRC & WAPI studio block (World-Bible signature, not in the plan table),
 * street furniture and four verbatim readables fill out the strip.
 *
 * Performance: infill buildings, their windows, cornices and doorway
 * strips are all InstancedMesh (6 draw calls total regardless of count);
 * only the two plan landmarks and the studio block use the full deco
 * helper vocabulary for hand-built presence. Estimated district total
 * is well under the ~120 draw-call budget.
 */

export async function build(ctx) {
  const { THREE, scene, plan, materials, deco, registerInteractive } = ctx;

  const group = new THREE.Group();
  group.name = 'district-alabama-way';
  scene.add(group);

  const landmarks = plan.landmarks.filter((l) => l.district === 'alabama-way');
  const theatreLM = landmarks.find((l) => l.id === 'alabama-theatre');
  const savoyLM = landmarks.find((l) => l.id === 'club-savoy');

  // Buildings north of 2nd Avenue North (z=-140, the show-street spine)
  // front south toward it; buildings south of it front north toward it.
  const frontSignFor = (z) => (z < -140 ? 1 : -1);

  // ---------------- shared geometry & instancing accumulators ----------------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0); // pivot at bottom-center
  const unitPlane = new THREE.PlaneGeometry(1, 1);

  const limestoneBodies = [];
  const brickBodies = [];
  const cornices = [];
  const doorStrips = [];
  const dayWindows = [];
  const nightWindows = [];

  function makeInstanced(matrices, material, geom) {
    const g2 = geom || unitBox;
    const mesh = new THREE.InstancedMesh(g2, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  function pushWindows(x, z, w, d, h, frontSign) {
    const rows = Math.max(2, Math.min(6, Math.floor((h - 4) / 4)));
    const cols = Math.max(2, Math.min(8, Math.floor(w / 5)));
    const spacingX = w / (cols + 1);
    const spacingY = rows > 1 ? (h - 6) / (rows - 1) : 0;
    const winW = Math.min(1.6, spacingX * 0.55);
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, frontSign > 0 ? 0 : Math.PI, 0)
    );
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lx = (c - (cols - 1) / 2) * spacingX;
        const ly = 3.5 + r * spacingY;
        const pz = z + frontSign * (d / 2 + 0.05);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x + lx, ly, pz),
          quat,
          new THREE.Vector3(winW, 2.1, 1)
        );
        (Math.random() < 0.32 ? nightWindows : dayWindows).push(m);
      }
    }
  }

  function addInfillBuilding(x, z, w, d, h) {
    const bodyM = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)
    );
    (Math.random() < 0.55 ? limestoneBodies : brickBodies).push(bodyM);
    cornices.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, h, z), new THREE.Quaternion(), new THREE.Vector3(w + 0.6, 0.5, d + 0.6)
    ));
    const frontSign = frontSignFor(z);
    const doorQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, frontSign > 0 ? 0 : Math.PI, 0)
    );
    doorStrips.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0.15, z + frontSign * (d / 2 + 0.06)),
      doorQuat, new THREE.Vector3(w * 0.4, 0.3, 0.1)
    ));
    pushWindows(x, z, w, d, h, frontSign);
  }

  // ---------------- landmark & studio-block exclusion rectangles ----------------
  const studioPos = [560, -260];
  const studioW = 28, studioD = 22;

  const exclude = [];
  for (const lm of landmarks) {
    const [w, d] = lm.footprint;
    const buf = 7;
    exclude.push({
      x0: lm.position[0] - w / 2 - buf, x1: lm.position[0] + w / 2 + buf,
      z0: lm.position[1] - d / 2 - buf, z1: lm.position[1] + d / 2 + buf,
    });
  }
  exclude.push({
    x0: studioPos[0] - studioW / 2 - 7, x1: studioPos[0] + studioW / 2 + 7,
    z0: studioPos[1] - studioD / 2 - 7, z1: studioPos[1] + studioD / 2 + 7,
  });

  const streetXs = [240, 360, 480, 600];
  const streetZs = [-280, -210, -140, 0, 140];
  function nearStreet(x, z) {
    for (const sx of streetXs) if (Math.abs(x - sx) < 11) return true;
    for (const sz of streetZs) if (Math.abs(z - sz) < 11) return true;
    return false;
  }
  function overlapsExcluded(x, z, w, d) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    return exclude.some((r) => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0);
  }

  // ---------------- background fabric: scatter infill across the polygon ----------------
  let seed = 91731;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 10000) / 10000;
  }

  for (let gx = 246; gx <= 596; gx += 38) {
    for (let gz = -304; gz <= 196; gz += 44) {
      if (rnd() < 0.16) continue; // gaps / alley mouths
      const jx = gx + (rnd() - 0.5) * 12;
      const jz = gz + (rnd() - 0.5) * 14;
      if (nearStreet(jx, jz)) continue;
      const nearStrip = Math.abs(jz + 140) < 90;
      const w = 13 + rnd() * 9;
      const d = 11 + rnd() * 7;
      const h = nearStrip ? 15 + rnd() * 15 : 8 + rnd() * 9;
      if (overlapsExcluded(jx, jz, w + 2, d + 2)) continue;
      addInfillBuilding(jx, jz, w, d, h);
    }
  }

  if (limestoneBodies.length) group.add(makeInstanced(limestoneBodies, materials.limestone));
  if (brickBodies.length) group.add(makeInstanced(brickBodies, materials.brick));
  if (cornices.length) group.add(makeInstanced(cornices, materials.terracotta));
  if (doorStrips.length) group.add(makeInstanced(doorStrips, materials.bronze));
  if (dayWindows.length) group.add(makeInstanced(dayWindows, materials.glassDay, unitPlane));
  if (nightWindows.length) group.add(makeInstanced(nightWindows, materials.glassNight, unitPlane));

  // ================= ALABAMA THEATRE =================
  buildAlabamaTheatre();
  function buildAlabamaTheatre() {
    if (!theatreLM) return;
    const [w, d] = theatreLM.footprint;
    const h = theatreLM.height;
    const frontSign = frontSignFor(theatreLM.position[1]);
    const g = new THREE.Group();

    const bodyH = h * 0.72;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), materials.limestone);
    body.position.set(0, bodyH / 2, 0);
    g.add(body);

    const fly = new THREE.Mesh(new THREE.BoxGeometry(w * 0.48, h, d * 0.3), materials.brick);
    fly.position.set(0, h / 2, -frontSign * d * 0.3);
    g.add(fly);

    const facade = deco.pilasterFacade({
      width: w, height: bodyH, bays: 5,
      material: materials.limestone, pilasterMaterial: materials.terracotta,
    });
    facade.rotation.y = frontSign > 0 ? 0 : Math.PI;
    facade.position.set(0, 0, frontSign * (d / 2 + 0.05));
    g.add(facade);

    const canopy = deco.corniceBox({ width: w * 0.82, depth: 6, height: 1.1, material: materials.bronze });
    canopy.position.set(0, 5.3, frontSign * (d / 2 + 3));
    g.add(canopy);

    const marquee = deco.canvasSign('ALABAMA', { width: 13 });
    marquee.position.set(0, 8.1, frontSign * (d / 2 + 3.05));
    if (frontSign < 0) marquee.rotation.y = Math.PI;
    g.add(marquee);

    const marqueeSub = deco.canvasSign('WURLITZER TONIGHT - MATINEE 25c', {
      width: w * 0.75, canvasWidth: 768, canvasHeight: 128,
    });
    marqueeSub.position.set(0, 5.3, frontSign * (d / 2 + 6.05));
    if (frontSign < 0) marqueeSub.rotation.y = Math.PI;
    g.add(marqueeSub);

    const blade = deco.canvasSign('ALABAMA', { width: 9 });
    blade.rotation.z = Math.PI / 2;
    if (frontSign < 0) blade.rotation.y = Math.PI;
    blade.position.set(w * 0.34, h * 0.55, frontSign * (d / 2 + 0.4));
    g.add(blade);

    const mainDoor = deco.decoDoorway({ width: 3.4, height: 4.8 });
    mainDoor.rotation.y = frontSign > 0 ? 0 : Math.PI;
    mainDoor.position.set(0, 0, frontSign * (d / 2 + 0.05));
    g.add(mainDoor);

    for (const ox of [-w * 0.3, w * 0.3]) {
      const sideDoor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.6, 0.15), materials.bronze);
      sideDoor.position.set(ox, 1.8, frontSign * (d / 2 + 0.08));
      g.add(sideDoor);
    }

    const cols = Math.max(3, Math.floor(w / 6));
    const sideWin = deco.windowGrid({
      rows: 7, cols, spacingX: w / (cols + 1), spacingY: bodyH / 8,
      width: 1.3, height: 1.9, material: materials.glassNight,
    });
    sideWin.position.set(0, bodyH * 0.45, -frontSign * (d / 2 + 0.05));
    sideWin.rotation.y = frontSign > 0 ? Math.PI : 0;
    g.add(sideWin);

    const roofCornice = deco.corniceBox({ width: w + 1, depth: d * 0.4, height: 0.6, material: materials.terracotta });
    roofCornice.position.set(0, h, 0);
    g.add(roofCornice);
    const fin = deco.finial({ height: 6 });
    fin.position.set(0, h + 0.6, 0);
    g.add(fin);

    g.position.set(theatreLM.position[0], 0, theatreLM.position[1]);
    g.rotation.y = THREE.MathUtils.degToRad(theatreLM.rotationYDeg || 0);
    group.add(g);

    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.12), materials.bronze);
    plaque.position.set(
      theatreLM.position[0] - w * 0.32,
      1.3,
      theatreLM.position[1] + frontSign * (d / 2 + 0.5)
    );
    group.add(plaque);
    registerInteractive(plaque, {
      title: `Alabama Theatre — Opening Night Program, Dec 26 1927`,
      body: `A temple of the musick and the motion picture — cooled to a gentle seventy degrees by the marvel of conditioned air, the first such hall in the State of Alabama.`,
    });
  }

  // ================= CLUB SAVOY =================
  buildClubSavoy();
  function buildClubSavoy() {
    if (!savoyLM) return;
    const [w, d] = savoyLM.footprint;
    const h = savoyLM.height;
    const frontSign = frontSignFor(savoyLM.position[1]);
    const g = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.brick);
    body.position.set(0, h / 2, 0);
    g.add(body);

    const facade = deco.pilasterFacade({
      width: w, height: h, bays: 3,
      material: materials.brick, pilasterMaterial: materials.terracotta,
    });
    facade.rotation.y = frontSign > 0 ? 0 : Math.PI;
    facade.position.set(0, 0, frontSign * (d / 2 + 0.05));
    g.add(facade);

    const door = deco.decoDoorway({ width: 2.6, height: 4.2 });
    door.rotation.y = frontSign > 0 ? 0 : Math.PI;
    door.position.set(0, 0, frontSign * (d / 2 + 0.06));
    g.add(door);

    const win = deco.windowGrid({
      rows: 3, cols: 4, spacingX: w / 5, spacingY: 2.4,
      width: 1.3, height: 1.8, material: materials.glassNight,
    });
    win.position.set(0, h * 0.62, frontSign * (d / 2 + 0.05));
    win.rotation.y = frontSign > 0 ? 0 : Math.PI;
    g.add(win);

    const sign = deco.canvasSign('CLUB SAVOY', { width: 7.5 });
    sign.position.set(0, h + 1.6, frontSign * (d / 2 + 0.3));
    if (frontSign < 0) sign.rotation.y = Math.PI;
    g.add(sign);

    const subSign = deco.canvasSign('AFTER-HOURS JAZZ', { width: 5.5 });
    subSign.rotation.z = Math.PI / 2;
    if (frontSign < 0) subSign.rotation.y = Math.PI;
    subSign.position.set(w * 0.4, h * 0.5, frontSign * (d / 2 + 0.35));
    g.add(subSign);

    const cornice = deco.corniceBox({ width: w + 0.8, depth: d + 0.4, height: 0.5, material: materials.terracotta });
    cornice.position.set(0, h, 0);
    g.add(cornice);

    g.position.set(savoyLM.position[0], 0, savoyLM.position[1]);
    g.rotation.y = THREE.MathUtils.degToRad(savoyLM.rotationYDeg || 0);
    group.add(g);
  }

  // ================= WBRC & WAPI STUDIO BLOCK (World-Bible signature; invented placement) =================
  buildStudioBlock();
  function buildStudioBlock() {
    const frontSign = frontSignFor(studioPos[1]);
    const towerHeight = 22;
    const tower = deco.setbackTower({
      width: studioW, depth: studioD, height: towerHeight, setbacks: 1,
      material: materials.limestone, windowMaterial: materials.glassDay,
    });
    tower.position.set(studioPos[0], 0, studioPos[1]);
    group.add(tower);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 9, 8), materials.steelDark);
    mast.position.set(studioPos[0], towerHeight + 4.5, studioPos[1]);
    group.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), materials.furnaceGlow);
    beacon.position.set(studioPos[0], towerHeight + 9, studioPos[1]);
    group.add(beacon);

    const call1 = deco.canvasSign('WBRC', { width: 5 });
    call1.position.set(studioPos[0] - 6, 12, studioPos[1] + frontSign * (studioD / 2 + 0.3));
    if (frontSign < 0) call1.rotation.y = Math.PI;
    group.add(call1);
    const call2 = deco.canvasSign('WAPI', { width: 5 });
    call2.position.set(studioPos[0] + 6, 12, studioPos[1] + frontSign * (studioD / 2 + 0.3));
    if (frontSign < 0) call2.rotation.y = Math.PI;
    group.add(call2);

    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.12), materials.bronze);
    plaque.position.set(
      studioPos[0] - studioW / 2 - 0.5,
      1.3,
      studioPos[1] + frontSign * (studioD / 2 + 0.5)
    );
    group.add(plaque);
    registerInteractive(plaque, {
      title: `WBRC Nightly Sign-On`,
      body: `You're listening to WBRC, fourteen hundred feet above sea level and rising — the Voice of Vulcan, broadcasting from the Heaviest Corner on Earth.`,
    });
  }

  // ================= NEWSSTAND & PAINTED ADVERTISEMENT (readables) =================
  buildNewsstand();
  function buildNewsstand() {
    const x = 340, z = -150;
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 0.9), materials.steelDark);
    kiosk.position.set(x, 0.65, z);
    group.add(kiosk);
    const board = deco.canvasSign('THE LEDGER - 2c', { width: 2.4, canvasWidth: 384, canvasHeight: 160 });
    board.position.set(x, 1.9, z + 0.5);
    group.add(board);
    registerInteractive(kiosk, {
      title: `Newsboy's Corner — Ledger Extra, October 1928`,
      body: `EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!`,
    });
  }

  buildPaintedAd();
  function buildPaintedAd() {
    const x = 440, z = -190;
    const ad = deco.canvasSign("TC IRON - MADE WHERE IT'S MINED", { width: 12, canvasWidth: 768, canvasHeight: 192 });
    ad.position.set(x, 9, z);
    group.add(ad);
    registerInteractive(ad, {
      title: `Painted Advertisement — The Age-Herald`,
      body: `MADE WHERE IT'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH'S OWN METAL.`,
    });
  }

  // ================= STREET FURNITURE =================
  const lampSpots = [];
  for (let x = 250; x <= 590; x += 58) {
    lampSpots.push([x, -152]);
    lampSpots.push([x, -128]);
  }
  lampSpots.push([theatreLM ? theatreLM.position[0] - 24 : 356, -108]);
  lampSpots.push([savoyLM ? savoyLM.position[0] + 18 : 318, 10]);
  for (const [x, z] of lampSpots) {
    if (overlapsExcluded(x, z, 2, 2)) continue;
    const lamp = deco.streetlamp();
    lamp.position.set(x, 0, z);
    group.add(lamp);
  }

  // benches, curb cars, sidewalk trees — instanced
  const benchMats = [];
  const carMats = [];
  const trunkMats = [];
  const canopyMats = [];
  for (let x = 260; x <= 580; x += 70) {
    benchMats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, -132), new THREE.Quaternion(), new THREE.Vector3(1.5, 0.44, 0.5)
    ));
    carMats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x + 20, 0, -146), new THREE.Quaternion(), new THREE.Vector3(4.3, 1.3, 1.7)
    ));
  }
  for (let x = 250; x <= 590; x += 90) {
    trunkMats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, 60), new THREE.Quaternion(), new THREE.Vector3(0.3, 2.8, 0.3)
    ));
    canopyMats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 4.2, 60), new THREE.Quaternion(), new THREE.Vector3(3, 3, 3)
    ));
  }
  if (benchMats.length) group.add(makeInstanced(benchMats, materials.bronze));
  if (carMats.length) group.add(makeInstanced(carMats, materials.steelDark));
  if (trunkMats.length) group.add(makeInstanced(trunkMats, materials.brick));
  if (canopyMats.length) {
    const canopyGeom = new THREE.SphereGeometry(0.5, 8, 6);
    group.add(makeInstanced(canopyMats, materials.foliage, canopyGeom));
  }

  // Club Savoy interior (dynamic, optional; never edits other files)
  try {
    const savoy = await import('./alabama-way-savoy.js');
    await savoy.build(ctx);
    if (savoyLM) savoy.wireDoor(ctx, savoyLM, frontSignFor(savoyLM.position[1]));
  } catch (err) { console.warn('[magic-city] club-savoy interior skipped', err && err.message); }
}
