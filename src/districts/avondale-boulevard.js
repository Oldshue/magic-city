/**
 * avondale-boulevard.js — "Avondale & The Boulevard" district builder.
 *
 * Streetcar-suburb belt east of downtown: bungalows and merchant homes
 * around Avondale Park, the Valley Federation of Labor Temple, and a small
 * commercial spine ("The Boulevard") of shopfronts. Foremen, shopkeepers
 * and the new union aristocracy live here. Quiet by day, porch-lit by night.
 *
 * Landmarks built (law, from data/city-plan.json):
 *   - valley-federation-of-labor-temple  (760, 130)  32x44  h18
 *   - avondale-park-and-spring           (950, 330)  200x170 h5
 *
 * District polygon (law): [[620,-1200],[1200,-1200],[1200,700],[620,700]]
 *
 * Exports: `export async function build(ctx)`.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotXZ(x, z, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x * c + z * s, z: -x * s + z * c };
}

function inBox(x, z, b) {
  return x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3];
}

export async function build(ctx) {
  const { THREE, scene, materials, deco, registerInteractive } = ctx;
  const rand = mulberry32(0xA1D0E7);

  const group = new THREE.Group();
  group.name = 'district-avondale-boulevard';
  scene.add(group);

  const dummy = new THREE.Object3D();
  const setInst = (mesh, i, x, y, z, ry, sx, sy, sz) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  // ---- exclusion boxes kept clear of the residential fill grid ----
  const EXCL = [
    [730, 795, 90, 175],     // Labor Temple + apron
    [815, 1090, 220, 440],   // Avondale Park + apron
    [660, 735, -580, -515],  // Avondale Mills Office
    [965, 1030, -125, -70],  // Library East Branch
    [625, 675, -190, 300],   // The Boulevard commercial spine + sidewalk
  ];
  const excluded = (x, z) => EXCL.some((b) => inBox(x, z, b));

  // =========================================================================
  // 1. VALLEY FEDERATION OF LABOR TEMPLE  (landmark, law: pos 760,130)
  // =========================================================================
  {
    const cx = 760, cz = 130, w = 32, d = 44, h = 18;
    const temple = new THREE.Group();
    temple.position.set(cx, 0, cz);

    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.limestone);
    base.position.y = h / 2;
    temple.add(base);

    // Front pilaster facade (faces +Z, the boulevard-facing entrance side).
    const facade = deco.pilasterFacade({
      width: w, height: h, bays: 4,
      material: materials.limestone, pilasterMaterial: materials.terracotta,
    });
    facade.position.set(0, 0, d / 2 - 0.05);
    temple.add(facade);

    // Cornices: base water-table line and roof cornice.
    const roofCornice = deco.corniceBox({ width: w + 1.2, depth: d + 1.2, height: 0.9, material: materials.terracotta });
    roofCornice.position.y = h;
    temple.add(roofCornice);
    const waterTable = deco.corniceBox({ width: w + 0.6, depth: d + 0.6, height: 0.5, material: materials.bronze });
    temple.add(waterTable);

    // Windows, front and back.
    const rows = 4, cols = 8;
    const winFront = deco.windowGrid({ rows, cols, spacingX: (w - 4) / cols, spacingY: 3.2, width: 1.4, height: 2.2, material: materials.glassDay });
    winFront.position.set(0, h * 0.55, d / 2 + 0.08);
    temple.add(winFront);
    const winBack = winFront.clone();
    winBack.position.z = -(d / 2 + 0.08);
    winBack.rotation.y = Math.PI;
    temple.add(winBack);
    // A few lit windows for night reading.
    const winNight = deco.windowGrid({ rows: 2, cols: 8, spacingX: (w - 4) / 8, spacingY: 3.2, width: 1.4, height: 2.2, material: materials.glassNight });
    winNight.position.set(0, h * 0.28, d / 2 + 0.09);
    temple.add(winNight);

    // Bronze-framed doorway with fanlight, centered on the front face.
    const doorway = deco.decoDoorway({ width: 3.6, height: 5.2, frameMaterial: materials.bronze, doorMaterial: materials.steelDark });
    doorway.position.set(0, 0, d / 2 + 0.05);
    temple.add(doorway);

    // Bronze furnace-door relief plaques flanking the entrance.
    const reliefGeo = new THREE.BoxGeometry(2.4, 3.2, 0.25);
    for (const sx of [-6, 6]) {
      const relief = new THREE.Mesh(reliefGeo, materials.bronze);
      relief.position.set(sx, 3.2, d / 2 + 0.15);
      temple.add(relief);
    }

    // Dedication stone / bronze plaque — readable #1.
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.15), materials.bronze);
    plaque.position.set(0, 1.4, d / 2 + 0.2);
    temple.add(plaque);
    registerInteractive(plaque, {
      title: 'Labor Temple Dedication Stone',
      body: "ERECTED 1926 BY THE VALLEY FEDERATION OF LABOR — IN MEMORY OF THE ACCORD OF 1921, WHEN THE MEN WHO POURED THE IRON FIRST SHARED IN WHAT IT SOLD FOR.",
    });

    // Name sign over the entrance.
    const sign = deco.canvasSign('VALLEY FEDERATION OF LABOR', { width: 14 });
    sign.position.set(0, h + 1.6, d / 2 + 0.1);
    temple.add(sign);

    group.add(temple);
  }

  // =========================================================================
  // 2. AVONDALE PARK & SPRING  (landmark, law: pos 950,330, 200x170)
  // =========================================================================
  {
    const cx = 950, cz = 330;
    const park = new THREE.Group();
    park.position.set(cx, 0, cz);

    const lawn = new THREE.Mesh(new THREE.CircleGeometry(95, 40), materials.foliage);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.02;
    park.add(lawn);

    const path = new THREE.Mesh(new THREE.RingGeometry(58, 62, 48), materials.sidewalk);
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.03;
    park.add(path);

    // Spring-fed pool: reflective blue-grey water using the shared glassDay material.
    const pond = new THREE.Mesh(new THREE.CircleGeometry(24, 36), materials.glassDay);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-18, 0.06, 8);
    park.add(pond);
    const pondRim = new THREE.Mesh(new THREE.RingGeometry(24, 25.4, 36), materials.limestone);
    pondRim.rotation.x = -Math.PI / 2;
    pondRim.position.set(-18, 0.05, 8);
    park.add(pondRim);

    // Amphitheater: three stepped concentric seating arcs facing the grotto.
    for (let t = 0; t < 3; t++) {
      const rIn = 30 + t * 4, rOut = rIn + 3;
      const seat = new THREE.Mesh(
        new THREE.RingGeometry(rIn, rOut, 24, 1, Math.PI * 0.15, Math.PI * 0.7),
        materials.limestone
      );
      seat.rotation.x = -Math.PI / 2;
      seat.position.set(30, 0.15 + t * 0.35, -20);
      park.add(seat);
    }

    // Grotto: instanced sandstone boulder cluster.
    const boulderGeo = new THREE.IcosahedronGeometry(1, 0);
    const boulders = new THREE.InstancedMesh(boulderGeo, materials.limestone, 14);
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, r = 4 + rand() * 3;
      const s = 1.2 + rand() * 1.6;
      setInst(boulders, i, 40 + Math.cos(a) * r, s * 0.5, -35 + Math.sin(a) * r, rand() * Math.PI, s, s * 0.8, s);
    }
    boulders.instanceMatrix.needsUpdate = true;
    park.add(boulders);

    // Deco gazebo/bandstand: columns + domed roof + finial.
    const gazeboDeck = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 8), materials.sidewalk);
    gazeboDeck.position.set(0, 0.2, -5);
    park.add(gazeboDeck);
    const gazeboCols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 4, 8), materials.limestone, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      setInst(gazeboCols, i, Math.cos(a) * 6.3, 2.2, -5 + Math.sin(a) * 6.3, 0, 1, 1, 1);
    }
    gazeboCols.instanceMatrix.needsUpdate = true;
    park.add(gazeboCols);
    const gazeboRoof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 3.4, 8), materials.terracotta);
    gazeboRoof.position.set(0, 5.9, -5);
    park.add(gazeboRoof);
    const gazeboFinial = deco.finial({ height: 2.2 });
    gazeboFinial.position.set(0, 7.6, -5);
    park.add(gazeboFinial);

    // Park benches, instanced.
    const benchGeo = new THREE.BoxGeometry(1.8, 0.45, 0.6);
    const benches = new THREE.InstancedMesh(benchGeo, materials.steelDark, 10);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      setInst(benches, i, Math.cos(a) * 60, 0.3, Math.sin(a) * 55, a + Math.PI / 2, 1, 1, 1);
    }
    benches.instanceMatrix.needsUpdate = true;
    park.add(benches);

    group.add(park);
  }

  // Shared tree instance arrays, filled across the whole district then baked
  // into two InstancedMeshes (trunk + canopy) at the end for a cheap forest.
  const treeXforms = [];

  // Scatter park elms.
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, r = 20 + rand() * 78;
    const x = 950 + Math.cos(a) * r, z = 330 + Math.sin(a) * r * 0.85;
    if (Math.hypot(x - 950 + 18, z - 330 - 8) < 27) continue; // keep clear of pond
    treeXforms.push({ x, z, s: 0.85 + rand() * 0.5 });
  }

  // =========================================================================
  // 3. AVONDALE MILLS OFFICE (World Bible signature, background landmark)
  // =========================================================================
  {
    const cx = 697, cz = -547, w = 34, d = 24, h = 15;
    const mills = new THREE.Group();
    mills.position.set(cx, 0, cz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.brick);
    base.position.y = h / 2;
    mills.add(base);
    const facade = deco.pilasterFacade({ width: w, height: h, bays: 6, material: materials.brick, pilasterMaterial: materials.limestone });
    facade.position.set(0, 0, d / 2 - 0.05);
    mills.add(facade);
    const cornice = deco.corniceBox({ width: w + 1, depth: d + 1, height: 0.7, material: materials.terracotta });
    cornice.position.y = h;
    mills.add(cornice);
    const win = deco.windowGrid({ rows: 3, cols: 7, spacingX: (w - 4) / 7, spacingY: 3.4, width: 1.4, height: 2.1, material: materials.glassDay });
    win.position.set(0, h * 0.55, d / 2 + 0.08);
    mills.add(win);
    const winB = win.clone(); winB.position.z = -(d / 2 + 0.08); winB.rotation.y = Math.PI;
    mills.add(winB);
    const doorway = deco.decoDoorway({ width: 3, height: 4.4 });
    doorway.position.set(0, 0, d / 2 + 0.05);
    mills.add(doorway);
    const sign = deco.canvasSign('AVONDALE MILLS CO. — OFFICE', { width: 12 });
    sign.position.set(0, h + 1.4, d / 2 + 0.1);
    mills.add(sign);
    group.add(mills);
  }

  // =========================================================================
  // 4. BIRMINGHAM PUBLIC LIBRARY — EAST BRANCH (World Bible signature)
  // =========================================================================
  {
    const cx = 997, cz = -97, w = 20, d = 16, h = 10;
    const lib = new THREE.Group();
    lib.position.set(cx, 0, cz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.limestone);
    base.position.y = h / 2;
    lib.add(base);
    const cornice = deco.corniceBox({ width: w + 1, depth: d + 1, height: 0.6, material: materials.terracotta });
    cornice.position.y = h;
    lib.add(cornice);
    const win = deco.windowGrid({ rows: 2, cols: 5, spacingX: (w - 4) / 5, spacingY: 3, width: 1.6, height: 2.4, material: materials.glassDay });
    win.position.set(0, h * 0.55, d / 2 + 0.08);
    lib.add(win);
    const doorway = deco.decoDoorway({ width: 3.2, height: 4.2 });
    doorway.position.set(0, 0, d / 2 + 0.05);
    lib.add(doorway);
    const sign = deco.canvasSign('BIRMINGHAM PUBLIC LIBRARY — EAST BRANCH', { width: 11 });
    sign.position.set(0, h + 1.3, d / 2 + 0.1);
    lib.add(sign);
    group.add(lib);
  }

  // =========================================================================
  // 5. THE BOULEVARD — merchant shopfront spine along x≈650
  // =========================================================================
  const shopNames = [
    'AVONDALE PHARMACY',
    'MERCHANT GROCERY CO.',
    'IDEAL BARBER SHOP — HAIRCUT 25¢',
    'SPRING CITY BAKERY — BREAD 7¢',
    'AVONDALE HARDWARE',
  ];
  let adWallMesh = null;
  {
    const shopX = 650;
    let z = -150;
    for (let i = 0; i < shopNames.length; i++) {
      const w = 13, d = 16, h = 8 + (i % 2) * 1.5;
      const shop = new THREE.Group();
      shop.position.set(shopX, 0, z);
      const mat = i % 2 === 0 ? materials.brick : materials.limestone;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      body.position.y = h / 2;
      shop.add(body);
      const win = deco.windowGrid({ rows: 2, cols: 3, spacingX: 3.6, spacingY: 2.6, width: 1.5, height: 2, material: materials.glassDay });
      win.position.set(0, h * 0.6, d / 2 + 0.07);
      shop.add(win);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.35, 1.8), materials.terracotta);
      awning.position.set(0, h * 0.42, d / 2 + 1.2);
      shop.add(awning);
      const sign = deco.canvasSign(shopNames[i], { width: 8.5 });
      sign.position.set(0, h + 0.9, d / 2 + 0.05);
      shop.add(sign);

      if (i === 1) {
        // Reserve this shop's north sidewall for the painted advertisement.
        adWallMesh = shop;
        adWallMesh.userData.wallW = d;
        adWallMesh.userData.wallH = h;
        adWallMesh.userData.wallX = -w / 2 - 0.05;
      }

      group.add(shop);
      z += 45;
    }
  }

  // Painted wall advertisement — readable #2, on the grocery's side wall.
  {
    const adSign = deco.canvasSign("MADE WHERE IT'S MINED — TC IRON", { width: 9 });
    adSign.rotation.y = Math.PI / 2;
    adSign.position.set(
      adWallMesh.position.x + adWallMesh.userData.wallX,
      adWallMesh.userData.wallH * 0.55,
      adWallMesh.position.z
    );
    group.add(adSign);
    registerInteractive(adSign, {
      title: 'Painted Wall Advertisement',
      body: "MADE WHERE IT'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH'S OWN METAL.",
    });
  }

  // =========================================================================
  // 6. NEWSPAPER STAND — readable #3
  // =========================================================================
  {
    const stand = new THREE.Group();
    stand.position.set(657, 0, -60);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.7, 0.8), materials.steelDark);
    frame.position.y = 0.85;
    stand.add(frame);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 1.1), materials.terracotta);
    roof.position.y = 1.8;
    stand.add(roof);
    const front = deco.canvasSign('THE BIRMINGHAM LEDGER — THE VOICE OF THE VALLEY', { width: 2.6, canvasWidth: 512, canvasHeight: 320 });
    front.rotation.y = 0;
    front.position.set(0, 1.0, 0.42);
    stand.add(front);
    group.add(stand);
    registerInteractive(front, {
      title: 'Birmingham Ledger — Front Page',
      body: "EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!",
    });
  }

  // =========================================================================
  // 7. STREETLAMPS along the Boulevard and the park loop
  // =========================================================================
  const lampSpots = [
    [648, -170], [648, -30], [648, 110], [648, 250],
    [890, 250], [1010, 250], [950, 425], [950, 235],
  ];
  for (const [x, z] of lampSpots) {
    const lamp = deco.streetlamp();
    lamp.position.set(x, 0, z);
    group.add(lamp);
  }

  // =========================================================================
  // 8. RESIDENTIAL FABRIC — instanced bungalow grid
  // =========================================================================
  const lots = [];
  for (let x = 650; x <= 1180; x += 55) {
    for (let z = -1180; z <= 680; z += 65) {
      if (excluded(x, z)) continue;
      if (rand() < 0.14) continue; // yard gaps / vacant lots
      const jx = x + (rand() - 0.5) * 12;
      const jz = z + (rand() - 0.5) * 14;
      if (excluded(jx, jz)) continue;
      lots.push({
        x: jx, z: jz,
        ry: [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(rand() * 4)],
        w: 8 + rand() * 4,
        d: 9 + rand() * 5,
        h: 4.2 + rand() * 2.4,
        tint: 0.75 + rand() * 0.5,
        night: rand() < 0.32,
        chimney: rand() < 0.7,
        tree: rand() < 0.55,
      });
    }
  }

  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4);
  const chimneyGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const winGeo = new THREE.PlaneGeometry(1.1, 1.4);

  const bodies = new THREE.InstancedMesh(bodyGeo, materials.brick, lots.length);
  const roofs = new THREE.InstancedMesh(roofGeo, materials.steelDark, lots.length);
  const chimneys = new THREE.InstancedMesh(chimneyGeo, materials.brick, lots.length);
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lots.length * 3), 3);

  const winDay = [];
  const winNight = [];

  lots.forEach((lot, i) => {
    setInst(bodies, i, lot.x, lot.h / 2, lot.z, lot.ry, lot.w, lot.h, lot.d);
    const c = new THREE.Color().setScalar(lot.tint);
    bodies.setColorAt(i, c);

    const roofH = lot.h * 0.55;
    setInst(roofs, i, lot.x, lot.h + roofH / 2, lot.z, lot.ry + Math.PI / 4, lot.w * 1.05, roofH, lot.d * 1.05);

    const chY = lot.chimney ? lot.h + roofH * 0.9 : -50; // park unused chimneys underground
    const chOff = rotXZ(lot.w * 0.28, lot.d * 0.22, lot.ry);
    setInst(chimneys, i, lot.x + chOff.x, chY, lot.z + chOff.z, lot.ry, 1, 1, 1);

    // Two front windows on the forward face (+local Z).
    const half = lot.d / 2 + 0.06;
    for (const off of [-lot.w * 0.24, lot.w * 0.24]) {
      const p = rotXZ(off, half, lot.ry);
      const target = lot.night ? winNight : winDay;
      target.push({ x: lot.x + p.x, y: lot.h * 0.55, z: lot.z + p.z, ry: lot.ry });
    }

    if (lot.tree) {
      const to = rotXZ((rand() - 0.5) * lot.w, -lot.d * 0.65, lot.ry);
      treeXforms.push({ x: lot.x + to.x, z: lot.z + to.z, s: 0.7 + rand() * 0.4 });
    }
  });
  bodies.instanceMatrix.needsUpdate = true;
  bodies.instanceColor.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  chimneys.instanceMatrix.needsUpdate = true;
  group.add(bodies, roofs, chimneys);

  const buildWindowInstances = (list, mat) => {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(winGeo, mat, list.length);
    list.forEach((w, i) => setInst(mesh, i, w.x, w.y, w.z, w.ry, 1, 1, 1));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };
  buildWindowInstances(winDay, materials.glassDay);
  buildWindowInstances(winNight, materials.glassNight);

  // =========================================================================
  // 9. TREES — one shared instanced trunk + canopy for park, street, yards
  // =========================================================================
  {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 2.2, 6);
    const canopyGeo = new THREE.SphereGeometry(1.6, 8, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, materials.brick, treeXforms.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, materials.foliage, treeXforms.length);
    treeXforms.forEach((t, i) => {
      setInst(trunks, i, t.x, 1.1 * t.s, t.z, 0, t.s, t.s, t.s);
      setInst(canopies, i, t.x, 2.6 * t.s, t.z, 0, t.s, t.s, t.s);
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    group.add(trunks, canopies);
  }

  // =========================================================================
  // 10. SIDEWALK FURNITURE — mailboxes / hydrants along the Boulevard
  // =========================================================================
  {
    const hydrantGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8);
    const spots = [[646, -100], [646, 60], [646, 200], [1000, 260], [900, 400]];
    const hydrants = new THREE.InstancedMesh(hydrantGeo, materials.bronze, spots.length);
    spots.forEach(([x, z], i) => setInst(hydrants, i, x, 0.4, z, 0, 1, 1, 1));
    hydrants.instanceMatrix.needsUpdate = true;
    group.add(hydrants);
  }

  // =========================================================================
  // 11. Ground fabric — sidewalk strip along the Boulevard spine
  // =========================================================================
  {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(10, 900), materials.sidewalk);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(645, 0.01, -200);
    group.add(walk);
  }
}
