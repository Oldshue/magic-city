/**
 * red-mountain-crest-vulcan-park.js
 * District Architect module for Magic City 1929.
 *
 * District: "Red Mountain Crest & Vulcan Park" (red-mountain-crest-vulcan-park)
 * The ore ridge itself — funicular head-houses, the crest parkway, stone
 * overlooks, and Vulcan: fifty-six feet of Sloss No. 2 pig iron atop his
 * hundred-and-twenty-foot sandstone-and-steel tower, anvil at his side,
 * spear lifted north over the valley smoke he feeds every night.
 *
 * export async function build(ctx)
 * ctx = { THREE, scene, plan, district, materials, deco, registerInteractive }
 */
export async function build(ctx) {
  const { THREE, scene, plan, materials, deco, registerInteractive } = ctx;
  const { setbackTower, corniceBox, pilasterFacade, finial, windowGrid,
           canvasSign, streetlamp, decoDoorway } = deco;

  const root = new THREE.Group();
  root.name = 'red-mountain-crest-vulcan-park';
  scene.add(root);

  const landmarks = plan.landmarks.filter(
    (l) => l.district === 'red-mountain-crest-vulcan-park'
  );
  const vulcanData = landmarks.find((l) => l.id === 'vulcan-monument');
  const sentinelData = landmarks.find((l) => l.id === 'sentinel-observation-deck');

  // ---- local supplementary materials (park textures not covered by the
  // shared palette; everything architectural below still uses materials.*). ----
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 });
  const graniteStone = new THREE.MeshStandardMaterial({ color: 0x8d8072, roughness: 0.92 });
  const redNeon = new THREE.MeshBasicMaterial({ color: 0xff2a18 });
  const oldIron = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.55, metalness: 0.7 });
  const flagRed = new THREE.MeshStandardMaterial({ color: 0x9a2b2b, roughness: 0.8, side: THREE.DoubleSide });

  buildVulcan();
  buildSentinelDeck();
  buildFunicular(-1120, 1035, 1, true);
  buildFunicular(1120, 1065, -1, false);
  buildPlaza();
  buildParapet();
  buildLamps();
  buildBenches();
  buildTrees();
  buildEntrance();

  return;

  // ================= builders (closures over root/materials/deco) =================

  function buildVulcan() {
    const pos = vulcanData ? vulcanData.position : [0, 1125];
    const rotY = THREE.MathUtils.degToRad((vulcanData && vulcanData.rotationYDeg) || 0);
    const group = new THREE.Group();
    group.position.set(pos[0], 0, pos[1]);
    group.rotation.y = rotY;
    root.add(group);

    // ---- octagonal sandstone-and-steel tower (120 ft ~ 37 m) ----
    const ped = new THREE.Group();
    group.add(ped);
    const seg8 = 8, thetaStart = Math.PI / 8;

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 10, 4, seg8, 1, false, thetaStart), materials.limestone);
    plinth.position.y = 2; ped.add(plinth);

    const lowerShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 8.5, 18, seg8, 1, false, thetaStart), materials.limestone);
    lowerShaft.position.y = 4 + 9; ped.add(lowerShaft);

    for (const bandY of [10, 17]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(8.6, 8.6, 0.4, seg8, 1, false, thetaStart), materials.steelDark);
      band.position.y = bandY; ped.add(band);
    }

    const balconyFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(7.2, 7.2, 0.5, seg8, 1, false, thetaStart), materials.terracotta);
    balconyFloor.position.y = 22.25; ped.add(balconyFloor);

    const balconyRail = new THREE.Mesh(
      new THREE.CylinderGeometry(7.3, 7.3, 1.2, seg8, 1, true, thetaStart), materials.steelDark);
    balconyRail.position.y = 23.1; ped.add(balconyRail);

    const upperShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 5.5, 8.6, seg8, 1, false, thetaStart), materials.limestone);
    upperShaft.position.y = 25.4 + 4.3; ped.add(upperShaft);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 4.3, 3, seg8, 1, false, thetaStart), materials.terracotta);
    cap.position.y = 34 + 1.5; ped.add(cap);

    const pedestalTop = 37;

    // Bronze plaque, base of tower — World Bible Voice fragment #2, verbatim.
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.12), materials.bronze);
    plaque.position.set(0, 2.4, 10.02);
    ped.add(plaque);
    registerInteractive(plaque, {
      title: 'Plaque, Base of Vulcan’s Tower',
      body: 'CAST OF SLOSS NO. 2 PIG IRON FOR THE ST. LOUIS FAIR, 1904. RAISED TO THE SUMMIT BY THE PEOPLE’S SENTINEL FUND, 1922. HE FACES THE FURNACES THAT MADE HIM.'
    });

    // ---- the figure himself: anvil-side stance, spear point lifted aloft ----
    const fig = new THREE.Group();
    fig.position.y = pedestalTop;
    group.add(fig);

    const iron = materials.steelDark;

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 6.5, 10), iron);
    legL.position.set(-0.9, 3.25, 0); fig.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 6.3, 10), iron);
    legR.position.set(0.9, 3.15, 0.4); legR.rotation.z = THREE.MathUtils.degToRad(-4);
    fig.add(legR);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.7, 4.6, 10), iron);
    torso.position.y = 6.5 + 2.3; fig.add(torso);

    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 1.9), oldIron);
    drape.position.set(0.4, 8.3, 0);
    drape.rotation.z = THREE.MathUtils.degToRad(24);
    fig.add(drape);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 10), iron);
    neck.position.y = 11.45; fig.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 12), iron);
    head.position.y = 12.6; fig.add(head);

    // Lowered arm, anvil side (west) — hand at rest near the hip.
    const armL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, 3.0, 8), iron);
    armL1.position.set(-1.7, 9.3, 0.2);
    armL1.rotation.z = THREE.MathUtils.degToRad(14);
    fig.add(armL1);
    const fistL = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), iron);
    fistL.position.set(-2.1, 7.9, 0.3); fig.add(fistL);

    // Raised arm, spear side (east) — spear point held aloft.
    const armR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 3.0, 8), iron);
    armR1.position.set(1.7, 10.4, -0.1);
    armR1.rotation.z = THREE.MathUtils.degToRad(-55);
    fig.add(armR1);
    const armR2 = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 2.4, 8), iron);
    armR2.position.set(2.3, 13.0, -0.4);
    fig.add(armR2);
    const fistR = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), iron);
    fistR.position.set(2.3, 14.3, -0.4); fig.add(fistR);

    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.5, 8), materials.steelDark);
    spear.position.set(2.3, 16.05, -0.4); fig.add(spear);
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8), redNeon);
    spearTip.position.set(2.3, 18.2, -0.4); fig.add(spearTip);

    // Red neon glow at the spear point — "his spear lit by red neon at dusk."
    const spearGlow = new THREE.PointLight(0xff2a18, 1.4, 45, 2);
    spearGlow.position.set(2.3, 18.4, -0.4);
    fig.add(spearGlow);

    // Anvil prop at his feet.
    const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.9), iron);
    anvilBase.position.set(-2.6, 0.45, 1.4); fig.add(anvilBase);
    const anvilTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.0), iron);
    anvilTop.position.set(-2.6, 1.18, 1.4); fig.add(anvilTop);

    registerInteractive(fig, {
      title: 'Vulcan',
      body: 'Fifty-six feet of Sloss No. 2 pig iron, spear lifted north over the valley he feeds. Sentinel of the Magic City.'
    });

    // Uplight floodlighting the figure — gives him presence after dark.
    const uplight = new THREE.SpotLight(0xfff0d2, 1.6, 90, THREE.MathUtils.degToRad(38), 0.5, 1.4);
    uplight.position.set(0, pedestalTop + 1, 6);
    const uplightTarget = new THREE.Object3D();
    uplightTarget.position.set(0, pedestalTop + 10, 0);
    group.add(uplight, uplightTarget);
    uplight.target = uplightTarget;
  }

  function buildSentinelDeck() {
    const pos = sentinelData ? sentinelData.position : [-95, 1090];
    const rotY = THREE.MathUtils.degToRad((sentinelData && sentinelData.rotationYDeg) || 0);
    const group = new THREE.Group();
    group.position.set(pos[0], 0, pos[1]);
    group.rotation.y = rotY;
    root.add(group);

    const support = setbackTower({
      width: 8, depth: 8, height: 33, setbacks: 1,
      material: materials.limestone, windowMaterial: materials.glassDay, crown: false,
    });
    group.add(support);

    const deckW = 26, deckD = 14;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 1.2, deckD), materials.terracotta);
    deck.position.set(0, 33.6, -deckD * 0.18);
    group.add(deck);

    const railF = new THREE.Mesh(new THREE.BoxGeometry(deckW, 1.1, 0.25), materials.steelDark);
    railF.position.set(0, 34.7, -deckD * 0.18 - deckD / 2 + 0.15);
    group.add(railF);
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, deckD), materials.steelDark);
    railL.position.set(-deckW / 2 + 0.15, 34.7, -deckD * 0.18);
    group.add(railL);
    const railR = railL.clone();
    railR.position.x = deckW / 2 - 0.15;
    group.add(railR);

    const brace1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), materials.steelDark);
    brace1.position.set(-3.5, 30, -deckD * 0.1);
    brace1.rotation.x = THREE.MathUtils.degToRad(28);
    group.add(brace1);
    const brace2 = brace1.clone();
    brace2.position.x = 3.5;
    group.add(brace2);

    const canopy = new THREE.Mesh(new THREE.ConeGeometry(6, 2.4, 4), materials.terracotta);
    canopy.rotation.y = Math.PI / 4;
    canopy.position.set(0, 35.9, -deckD * 0.18);
    group.add(canopy);

    const fin = finial({ height: 3 });
    fin.position.set(0, 36.6, -deckD * 0.18);
    group.add(fin);
  }

  function buildFunicular(x, z, faceSign, detailed) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    root.add(group);

    const facade = pilasterFacade({
      width: 10, height: 8, bays: 3,
      material: materials.limestone, pilasterMaterial: materials.terracotta,
    });
    facade.rotation.y = faceSign > 0 ? 0 : Math.PI;
    group.add(facade);

    const roof = corniceBox({ width: 11, depth: 9, height: 0.9, material: materials.terracotta });
    roof.position.y = 8;
    group.add(roof);

    const windows = windowGrid({ rows: 2, cols: 3, spacingX: 2.6, spacingY: 2.4,
      width: 1.2, height: 1.8, material: materials.glassNight });
    windows.position.set(0, 4.6, 0.22 * faceSign);
    windows.rotation.y = faceSign > 0 ? 0 : Math.PI;
    group.add(windows);

    if (detailed) {
      const door = decoDoorway({ width: 3, height: 4.2 });
      door.position.set(0, 0, 0.22 * faceSign);
      door.rotation.y = faceSign > 0 ? 0 : Math.PI;
      group.add(door);
    } else {
      const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 0.15), materials.steelDark);
      doorSlab.position.set(0, 1.7, 0.2 * faceSign);
      group.add(doorSlab);
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 0.3), materials.bronze);
      doorFrame.position.set(0, 3.55, 0.2 * faceSign);
      group.add(doorFrame);
    }

    const sign = canvasSign('CABLE INCLINE — 5¢', { width: 8 });
    sign.position.set(0, 9.6, 0.3 * faceSign);
    sign.rotation.y = faceSign > 0 ? 0 : Math.PI;
    group.add(sign);

    const pad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 10), materials.sidewalk);
    pad.position.y = 0.15;
    group.add(pad);

    const railA = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 20), materials.rail);
    railA.position.set(-1.1, 0.32, -10 * faceSign);
    group.add(railA);
    const railB = railA.clone();
    railB.position.x = 1.1;
    group.add(railB);
  }

  function buildPlaza() {
    // Refreshment stand.
    const stand = new THREE.Group();
    stand.position.set(55, 0, 1150);
    root.add(stand);

    const standFacade = pilasterFacade({ width: 9, height: 5.2, bays: 2,
      material: materials.limestone, pilasterMaterial: materials.terracotta });
    stand.add(standFacade);
    const standRoof = corniceBox({ width: 10, depth: 6, height: 0.6, material: materials.terracotta });
    standRoof.position.y = 5.2;
    stand.add(standRoof);
    const standDoor = decoDoorway({ width: 2.6, height: 3.6 });
    standDoor.position.set(0, 0, 0.22);
    stand.add(standDoor);
    const standSign = canvasSign('REFRESHMENTS · SANDWICHES 15¢', { width: 9 });
    standSign.position.set(0, 6.2, 0.4);
    stand.add(standSign);

    // Newsstand kiosk (readable: front page, verbatim Voice fragment #8).
    const news = new THREE.Group();
    news.position.set(-55, 0, 1150);
    root.add(news);
    const kiosk = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 8), materials.brick);
    kiosk.position.y = 1.3; news.add(kiosk);
    const kioskRoof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 8), materials.terracotta);
    kioskRoof.position.y = 3.15; news.add(kioskRoof);
    const board = canvasSign('THE BIRMINGHAM LEDGER', { width: 3.4 });
    board.position.set(0, 3.9, 1.5);
    news.add(board);
    const frontPage = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), materials.marquee);
    frontPage.position.set(0, 1.5, 1.42);
    news.add(frontPage);
    registerInteractive(frontPage, {
      title: 'Newsstand — The Birmingham Ledger, Extra Edition',
      body: 'EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!'
    });

    // Painted advertisement board (readable, verbatim Voice fragment #3).
    const ad = new THREE.Group();
    ad.position.set(0, 0, 1175);
    root.add(ad);
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 6), bark);
    postL.position.set(-2.2, 1.6, 0); ad.add(postL);
    const postR = postL.clone(); postR.position.x = 2.2; ad.add(postR);
    const adFace = canvasSign('MADE WHERE IT’S MINED — TC IRON', { width: 5, canvasWidth: 640, canvasHeight: 200 });
    adFace.position.set(0, 3.0, 0);
    ad.add(adFace);
    registerInteractive(adFace, {
      title: 'Painted Advertisement — back page of the Age-Herald',
      body: 'MADE WHERE IT’S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH’S OWN METAL.'
    });
  }

  function buildParapet() {
    const count = 26;
    const inst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.4, 1.1, 0.4), graniteStone, count);
    const m = new THREE.Matrix4();
    const halfSpan = 260;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = -halfSpan + t * halfSpan * 2;
      const z = 985 + Math.sin(t * Math.PI) * -8;
      m.makeTranslation(x, 0.55, z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    root.add(inst);
  }

  function buildLamps() {
    const positions = [
      [-320, 1015], [-160, 1055], [40, 1080], [220, 1050], [420, 1010],
    ];
    for (const [x, z] of positions) {
      const lamp = streetlamp();
      lamp.position.set(x, 0, z);
      root.add(lamp);
    }
  }

  function buildBenches() {
    const count = 20;
    const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.45, 0.55), bark, count);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.5, 0.12), materials.steelDark, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const x = -900 + t * 1800 + Math.sin(i * 12.9) * 40;
      const z = 780 + (i % 5) * 70 + Math.cos(i * 3.7) * 25;
      const ry = (i % 2) * Math.PI;
      m.makeRotationY(ry);
      m.setPosition(x, 0.45, z);
      seat.setMatrixAt(i, m);
      m.setPosition(x, 0.2, z - 0.22 * Math.cos(ry));
      legs.setMatrixAt(i, m);
    }
    seat.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
    root.add(seat, legs);
  }

  function buildTrees() {
    const count = 220;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3.2, 6), bark, count);
    const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(2.0, 4.2, 7), materials.foliage, count);
    const mt = new THREE.Matrix4(), mc = new THREE.Matrix4();
    let n = 0, guard = 0;
    while (n < count && guard < count * 6) {
      guard++;
      const x = -1150 + Math.random() * 2300;
      const z = 710 + Math.random() * 470;
      // Keep clear of the plaza, statue, deck, and funicular pads.
      const nearPlaza = Math.abs(x) < 130 && z > 1000 && z < 1200;
      const nearSentinel = Math.hypot(x - -95, z - 1090) < 22;
      const nearFuniW = Math.hypot(x - -1120, z - 1035) < 20;
      const nearFuniE = Math.hypot(x - 1120, z - 1065) < 20;
      if (nearPlaza || nearSentinel || nearFuniW || nearFuniE) continue;
      const scale = 0.7 + Math.random() * 0.8;
      mt.compose(
        new THREE.Vector3(x, 1.6 * scale, z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      trunk.setMatrixAt(n, mt);
      mc.compose(
        new THREE.Vector3(x, 3.6 * scale, z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      canopy.setMatrixAt(n, mc);
      n++;
    }
    trunk.count = n;
    canopy.count = n;
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    root.add(trunk, canopy);
  }

  function buildEntrance() {
    const monument = new THREE.Group();
    monument.position.set(0, 0, 760);
    root.add(monument);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 1.4), graniteStone);
    base.position.y = 0.8; monument.add(base);
    const sign = canvasSign('VULCAN PARK', { width: 7 });
    sign.position.set(0, 2.4, 0.75);
    monument.add(sign);
    const signBack = canvasSign('VULCAN PARK', { width: 7 });
    signBack.position.set(0, 2.4, -0.75);
    signBack.rotation.y = Math.PI;
    monument.add(signBack);

    const flag = new THREE.Group();
    flag.position.set(30, 0, 770);
    root.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9, 8), materials.steelDark);
    pole.position.y = 4.5; flag.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), flagRed);
    cloth.position.set(1.15, 8.1, 0);
    flag.add(cloth);
    const ball = finial({ height: 0.6, radius: 0.18 });
    ball.position.y = 9;
    flag.add(ball);
  }
}
