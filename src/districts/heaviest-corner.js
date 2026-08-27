/**
 * heaviest-corner.js — District 1: THE HEAVIEST CORNER
 *
 * Downtown deco canyon grown outward from 20th Street & 1st Avenue North:
 * five landmark towers, the Belt Elevated Loop skirting the core,
 * banker-grade infill fabric, marble-threshold sidewalks, period signage
 * and readables drawn verbatim from the World Bible.
 */
import * as THREE from '../../vendor/three.module.min.js';

export async function build(ctx) {
  const { THREE: T = THREE, scene, plan, district, materials, deco, registerInteractive } = ctx;
  const group = new THREE.Group();
  group.name = 'district-heaviest-corner';

  const poly = district.polygon;
  const minX = poly[0][0], maxX = poly[1][0], minZ = poly[1][1], maxZ = poly[3][1];

  // ------------------------------------------------------------------
  // Streetscape: sidewalks flanking 20th St N (x=0) and 1st Ave N (z=0)
  // ------------------------------------------------------------------
  const swMat = materials.sidewalk;
  function sidewalkStrip(cx, cz, sx, sz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), swMat);
    m.position.set(cx, 0.09, cz);
    group.add(m);
    return m;
  }
  sidewalkStrip(-12.5, (minZ + maxZ) / 2, 5, maxZ - minZ);   // west of 20th
  sidewalkStrip(12.5, (minZ + maxZ) / 2, 5, maxZ - minZ);    // east of 20th
  sidewalkStrip((minX + maxX) / 2, -12, maxX - minX, 5);     // north of 1st Ave
  sidewalkStrip((minX + maxX) / 2, 12, maxX - minX, 5);      // south of 1st Ave

  // ------------------------------------------------------------------
  // Helper: place a landmark tower exactly per plan
  // ------------------------------------------------------------------
  const placed = [];
  function towerAt(lm, opts, decorate) {
    const t = deco.setbackTower({
      width: lm.footprint[0], depth: lm.footprint[1], height: lm.height,
      ...opts,
    });
    t.position.set(lm.position[0], 0, lm.position[1]);
    t.rotation.y = (lm.rotationYDeg || 0) * Math.PI / 180;
    group.add(t);
    if (decorate) decorate(t);
    placed.push(t);
    return t;
  }

  function entrance(towerGroup, lm, offsetSide = 'south') {
    const dz = lm.footprint[1] / 2 + 0.35;
    const dx = lm.footprint[0] / 2 + 0.35;
    const door = deco.decoDoorway({ width: 3.4, height: 5 });
    if (offsetSide === 'south') { door.position.set(0, 0, dz); }
    else if (offsetSide === 'north') { door.position.set(0, 0, -dz); door.rotation.y = Math.PI; }
    else if (offsetSide === 'east') { door.position.set(dx, 0, 0); door.rotation.y = Math.PI / 2; }
    else { door.position.set(-dx, 0, 0); door.rotation.y = -Math.PI / 2; }
    towerGroup.add(door);
  }

  function facadeSign(towerGroup, lm, text, y, worldWidth, face = 'south', inset = 0.4) {
    // The base tier carries ~40% of the height at full footprint; anything
    // higher sits on a setback and a base-inset sign would float in air.
    y = Math.min(y, lm.height * 0.36);
    const s = deco.canvasSign(text, { width: worldWidth });
    const hz = lm.footprint[1] / 2 + inset;
    const hx = lm.footprint[0] / 2 + inset;
    if (face === 'south') s.position.set(0, y, hz);
    else if (face === 'north') { s.position.set(0, y, -hz); s.rotation.y = Math.PI; }
    else if (face === 'east') { s.position.set(hx, y, 0); s.rotation.y = Math.PI / 2; }
    else { s.position.set(-hx, y, 0); s.rotation.y = -Math.PI / 2; }
    towerGroup.add(s);
    return s;
  }

  // ---------------- Jefferson Trust Tower (invented, 125 m) ----------
  towerAt(
    plan.landmarks.find(l => l.id === 'jefferson-trust-tower'),
    { setbacks: 4, material: materials.limestone, windowMaterial: materials.glassNight },
    (g, ) => {
      const lm = plan.landmarks.find(l => l.id === 'jefferson-trust-tower');
      entrance(g, lm, 'south');
      entrance(g, lm, 'west');
      facadeSign(g, lm, 'JEFFERSON TRUST', lm.height * 0.42, 16);
      // Gold-lit ziggurat crown band (marquee glow).
      const crownBand = new THREE.Mesh(
        new THREE.BoxGeometry(lm.footprint[0] * 0.62 + 0.6, 1.4, lm.footprint[1] * 0.62 + 0.6),
        materials.glassNight
      );
      crownBand.position.y = lm.height * 0.945;
      g.add(crownBand);
      // "THE HEAVIEST CORNER ON EARTH" etched over the corner bank entrance.
      facadeSign(g, lm, 'THE HEAVIEST CORNER ON EARTH', 8.5, 22);
    }
  );

  // ---------------- First National–Hand Tower (real, 86 m) -----------
  {
    const lm = plan.landmarks.find(l => l.id === 'first-national-hand-tower');
    towerAt(
      lm,
      { setbacks: 2, material: materials.limestone, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'east');
        // Neoclassical colonnade base facing 20th Street.
        const colo = deco.pilasterFacade({ width: lm.footprint[1], height: 9, bays: 7,
          material: materials.limestone, pilasterMaterial: materials.bronze });
        colo.position.set(0, 0, lm.footprint[1] / 2 + 0.25);
        g.add(colo);
        facadeSign(g, lm, 'FIRST NATIONAL', lm.height * 0.86, 14);
      }
    );
  }

  // ---------------- Brown-Marx Building (real brick, 49 m) -----------
  {
    const lm = plan.landmarks.find(l => l.id === 'brown-marx-building');
    towerAt(
      lm,
      { setbacks: 2, material: materials.brick, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'west');
        facadeSign(g, lm, 'BROWN-MARX', lm.height * 0.92, 14, 'west');
      }
    );
  }

  // ---------------- Empire Building (white terra-cotta cake) ---------
  {
    const lm = plan.landmarks.find(l => l.id === 'empire-building');
    towerAt(
      lm,
      { setbacks: 4, material: materials.terracotta, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'west');
        // Stacked wedding-cake cornices.
        for (let i = 0; i < 3; i++) {
          const c = deco.corniceBox({ width: lm.footprint[0] * (1 - i * 0.08),
            depth: lm.footprint[1] * (1 - i * 0.08), height: 0.8, material: materials.terracotta });
          c.position.set(0, lm.height * (0.55 + i * 0.12), 0);
          g.add(c);
        }
        facadeSign(g, lm, 'EMPIRE', lm.height * 0.94, 12);
      }
    );
  }

  // ---------------- TCI Building (invented HQ, 116 m) ---------------
  {
    const lm = plan.landmarks.find(l => l.id === 'tci-building');
    towerAt(
      lm,
      { setbacks: 3, material: materials.steelDark, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'east');
        // Blast-furnace relief frieze over the bronze doors.
        const frieze = new THREE.Mesh(new THREE.BoxGeometry(18, 2.2, 0.5), materials.bronze);
        frieze.position.set(0, 7.4, lm.footprint[0] / 2 + 0.3);
        g.add(frieze);
        for (let i = 0; i < 4; i++) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.8, 6), materials.furnaceGlow);
          stack.position.set(-6 + i * 4, 7.4, lm.footprint[0] / 2 + 0.62);
          g.add(stack);
        }
        facadeSign(g, lm, 'TENNESSEE COAL & IRON', lm.height * 0.88, 20, 'east');
        facadeSign(g, lm, 'MADE WHERE IT’S MINED — TC IRON', lm.height * 0.83, 18, 'east');
      }
    );
  }

  // ------------------------------------------------------------------
  // Birmingham Belt Elevated Loop — deck skirting the core's north and
  // east edges inside this polygon, 9 m above grade, six car lines.
  // ------------------------------------------------------------------
  {
    const deckY = 7.6, deckH = 1.6, deckW = 13;
    const deckMat = materials.steelDark;

    function viaductRun(x0, z0, x1, z1) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const deck = new THREE.Mesh(
        horizontal ? new THREE.BoxGeometry(len, deckH, deckW)
                   : new THREE.BoxGeometry(deckW, deckH, len),
        deckMat
      );
      deck.position.set((x0 + x1) / 2, deckY, (z0 + z1) / 2);
      group.add(deck);
      // Twin rails on top.
      for (const off of [-2.2, 2.2]) {
        const rail = new THREE.Mesh(
          horizontal ? new THREE.BoxGeometry(len, 0.25, 0.3)
                     : new THREE.BoxGeometry(0.3, 0.25, len),
          materials.rail
        );
        rail.position.set(
          horizontal ? (x0 + x1) / 2 : x0 + off,
          deckY + deckH / 2 + 0.12,
          horizontal ? z0 + off : (z0 + z1) / 2
        );
        group.add(rail);
      }
      // Columns every ~22 m.
      const nCols = Math.max(2, Math.round(len / 22));
      const colGeo = new THREE.CylinderGeometry(0.55, 0.75, deckY, 8);
      const cols = new T.InstancedMesh(colGeo, deckMat, nCols);
      const mtx = new T.Matrix4();
      for (let i = 0; i < nCols; i++) {
        const f = nCols === 1 ? 0 : i / (nCols - 1);
        const x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
        mtx.makeTranslation(x, deckY / 2, z);
        cols.setMatrixAt(i, mtx);
      }
      cols.instanceMatrix.needsUpdate = true;
      group.add(cols);
    }

    // North leg (just inside the polygon's north edge) and east leg.
    viaductRun(minX, -308, maxX, -308);
    viaductRun(212, minZ, 212, maxZ);
  }

  // ------------------------------------------------------------------
  // Background fabric — banker-grade infill blocks filling the blocks
  // between landmarks, kept clear of avenues/streets/landmark footprints.
  // ------------------------------------------------------------------
  const infills = [
    // [cx, cz, sx, sz, h, mat]
    [-58, 66, 22, 22, 30, 'brick'],
    [-58, 118, 20, 20, 24, 'limestone'],
    [-60, 172, 22, 20, 28, 'brick'],
    [-98, 96, 18, 20, 22, 'limestone'],
    [86, -64, 24, 22, 34, 'limestone'],
    [152, -104, 26, 24, 40, 'brick'],
    [152, -44, 22, 20, 26, 'limestone'],
    [154, 44, 24, 22, 30, 'brick'],
    [86, 122, 22, 20, 25, 'limestone'],
    [162, 132, 20, 18, 22, 'brick'],
    [-102, -186, 26, 24, 36, 'limestone'],
    [-58, -206, 20, 18, 28, 'brick'],
    [100, -252, 24, 22, 32, 'limestone'],
    [-46, -256, 18, 16, 24, 'brick'],
  ];
  {
    const geoByMat = {};
    const lists = { brick: [], limestone: [] };
    const caps = [];
    const winMatrices = [];
    for (const [x, z, sx, sz, h, mat] of infills) {
      lists[mat].push([x, z, sx, sz, h]);
      geoByMat[mat] = geoByMat[mat] || null;
    }
    const unitGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const matName of ['brick', 'limestone']) {
      const items = lists[matName];
      const inst = new T.InstancedMesh(unitGeo, materials[matName], items.length);
      const mtx = new T.Matrix4();
      items.forEach(([x, z, sx, sz, h], i) => {
        mtx.makeScale(sx, h, sz);
        mtx.setPosition(x, h / 2, z);
        inst.setMatrixAt(i, mtx);
        // Terracotta cornice cap per roof.
        const capMtx = new T.Matrix4();
        capMtx.makeScale(sx + 0.8, 0.8, sz + 0.8);
        capMtx.setPosition(x, h + 0.4, z);
        caps.push(capMtx);
        // Window band matrices facing the nearest street (front +Z local).
        const rows = Math.max(3, Math.floor(h / 3.5));
        const colsW = Math.max(3, Math.floor(sx / 4));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < colsW; c++) {
            const wx = x - sx / 2 + ((c + 1) * sx) / (colsW + 1);
            const wy = 3 + r * (h / rows);
            winMatrices.push([wx, wy, z + sz / 2 + 0.06]);
          }
        }
      });
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    }

    // Terracotta cornice caps atop each infill block roof.
    if (caps.length) {
      const capGeo = new THREE.BoxGeometry(1, 1, 1);
      const capInst = new T.InstancedMesh(capGeo, materials.terracotta, caps.length);
      caps.forEach((capMtx, i) => capInst.setMatrixAt(i, capMtx));
      capInst.instanceMatrix.needsUpdate = true;
      group.add(capInst);
    }

    // Small glassNight window planes at each infill window position, facing +Z.
    if (winMatrices.length) {
      const winGeo = new THREE.PlaneGeometry(1.1, 1.8);
      const winInst = new T.InstancedMesh(winGeo, materials.glassNight, winMatrices.length);
      const winMtx = new T.Matrix4();
      winMatrices.forEach(([wx, wy, wz], i) => {
        winMtx.makeTranslation(wx, wy, wz);
        winInst.setMatrixAt(i, winMtx);
      });
      winInst.instanceMatrix.needsUpdate = true;
      group.add(winInst);
    }
  }

  // ------------------------------------------------------------------
  // Street furniture: lamps, benches, newsstand, hydrant-free corners
  // ------------------------------------------------------------------
  {
    const lampSpots = [
      [-13, -40], [13, -40], [-13, 30], [13, 30], [-13, 100], [13, 100],
      [-13, 170], [13, 170], [-40, 13], [40, 13], [110, 13], [170, 13],
    ];
    for (const [x, z] of lampSpots) {
      const lamp = deco.streetlamp();
      lamp.position.set(x, 0.18, z);
      lamp.rotation.y = x < 0 ? 0 : Math.PI;
      group.add(lamp);
    }
    // Benches along 1st Ave (instanced).
    const benchSeat = new THREE.BoxGeometry(2.2, 0.12, 0.6);
    const benchLeg = new THREE.BoxGeometry(0.12, 0.5, 0.5);
    const benchSeats = new T.InstancedMesh(benchSeat, materials.bronze, 8);
    const benchLegs = new T.InstancedMesh(benchLeg, materials.steelDark, 16);
    const m4 = new T.Matrix4();
    let bi = 0;
    for (let i = 0; i < 8; i++) {
      const x = -140 + i * 40;
      const z = i % 2 ? 13.5 : -13.5;
      m4.identity().setPosition(x, 0.68, z);
      benchSeats.setMatrixAt(bi, m4);
      for (const off of [-0.9, 0.9]) {
        m4.identity().setPosition(x + off, 0.43, z);
        benchLegs.setMatrixAt(bi * 2 + (off < 0 ? 0 : 1), m4);
      }
      bi++;
    }
    benchSeats.instanceMatrix.needsUpdate = true;
    benchLegs.instanceMatrix.needsUpdate = true;
    group.add(benchSeats, benchLegs);
  }

  // Newsboy's newspaper stand near the Corner.
  const newsstand = new THREE.Group();
  const standBody = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2), materials.brick);
  standBody.position.y = 1.3;
  newsstand.add(standBody);
  const standAwning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 2.4), materials.marquee);
  standAwning.position.set(0, 2.75, 0.2);
  newsstand.add(standAwning);
  const headPage = deco.canvasSign('THE BIRMINGHAM LEDGER — EXTRA!', { width: 3, canvasWidth: 512, canvasHeight: 128 });
  headPage.position.set(0, 1.8, 1.05);
  newsstand.add(headPage);
  newsstand.position.set(16, 0.18, -8);
  newsstand.rotation.y = -Math.PI / 4;
  group.add(newsstand);

  // ------------------------------------------------------------------
  // Readables — World Bible Voice fragments, verbatim
  // ------------------------------------------------------------------
  // 1. Bronze plaque beside the Jefferson Trust bank entrance.
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.08), materials.bronze);
  plaque.position.set(10 + 19.5, 1.6, -10 + 17.4);
  group.add(plaque);
  registerInteractive(plaque, {
    title: 'Bronze Plaque — Jefferson Trust lobby vestibule',
    body: 'Framed lede, The Birmingham Ledger, Nov 5, 1907:\n\n"WOODWARD SAYS NO. — TCI Declines Northern Bonds; \'Our Iron Will Carry Its Own Freight,\' Declares President, as Syndicate of the South Rallies to the Rescue."',
  });

  // 2. Newspaper stand front page.
  registerInteractive(headPage.children[0], {
    title: 'The Birmingham Ledger — Extra Edition, October 1928',
    body: '"EXTRA! BIRMINGHAAM PASSES PITTSBURGH! MILL MEN SAY THE VALLEY NEVER LOOKED BACK — LEDGER, TWO CENTS!"',
  });

  // 3. Painted wall advertisement on an infill wall (Age-Herald back page).
  const paintedAd = deco.canvasSign('MADE WHERE IT’S MINED!', { width: 14, canvasWidth: 512, canvasHeight: 160 });
  paintedAd.position.set(86 - 12.4, 9, -64);
  paintedAd.rotation.y = -Math.PI / 2;
  group.add(paintedAd);
  registerInteractive(paintedAd.children[0], {
    title: 'Painted Advertisement — TC Iron',
    body: '"MADE WHERE IT’S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, fire. Ask your dealer why northern steel costs more to haul less. TC IRON — THE SOUTH’S OWN METAL."',
  });

  // ------------------------------------------------------------------
  // BLOCK FILL PILOT (Block Fill Engineer) — party-wall street fabric
  // filling the block bounded by 21st St N (x -120) and 20th St N (x 0),
  // between 3rd Ave N (z -280) and 2nd Ave N (z -140). NOTE: the brief's
  // named pilot block (22nd/21st, x -240..-120) falls mostly OUTSIDE this
  // district's polygon (heaviest-corner minX = -160, while 22nd St sits
  // at x -240, inside terminal-quarter instead) — so this pilot uses the
  // adjacent in-bounds block one street east, per the brief's own
  // contingency ("pick the emptiest block in the same district and note
  // which you chose"). Three existing background-fabric infill buildings
  // (see the `infills` array above) already stand inside this block's
  // footprint: [-102,-186,26,24,...] overlaps the west frontage around
  // z -198..-174, and [-46,-256,18,16,...] overlaps the north frontage
  // around x -55..-37 — both covered below by gaps with margin so no
  // party-wall lot is placed over them. [-58,-206,20,18,...] sits clear
  // of every frontage in the block's open interior/service-yard zone (it
  // only grazes the alley's dirt-strip footprint there, a flat texture
  // plane under its base — no lot geometry touches it).
  // ------------------------------------------------------------------
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: 20211,
    block: { x0: -108, z0: -268, x1: -12, z1: -152 },
    gaps: [
      { side: 'west', from: -202, to: -170 },
      { side: 'north', from: -59, to: -33 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  scene.add(group);
}
