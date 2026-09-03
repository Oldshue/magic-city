/**
 * heaviest-corner.js — District 1: THE HEAVIEST CORNER
 *
 * Downtown deco canyon grown outward from 20th Street & 1st Avenue North:
 * five landmark towers, the Belt Elevated Loop skirting the core,
 * banker-grade infill fabric, marble-threshold sidewalks, period signage
 * and readables drawn verbatim from the World Bible.
 *
 * Facade Detail pass (M2): every landmark tower gets deco.facadeDetail
 * (dentil cornice + parapet, string courses, instanced window reveals)
 * plus deco.rooftopKit (water tank, chimneys, skylight monitor, hatch).
 * Brick background-fabric infill buildings get deco.fireEscape on a side
 * wall. Storefronts near the Corner get deco.awning + deco.shopSign with
 * period business names from the World Bible price canon (Section 5).
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

  // Facade Detail pass helper: dresses a landmark tower's base tier with
  // dentil cornice + string courses + instanced reveals, and drops a
  // rooftopKit cluster on top. Sized off the tower's own footprint/height
  // so it never touches the plan's stored position/rotation/footprint.
  function landmarkDetail(towerGroup, lm, material, seed) {
    towerGroup.add(deco.facadeDetail({
      width: lm.footprint[0], depth: lm.footprint[1], height: Math.max(8, lm.height * 0.4),
      material, seed, storefront: false,
    }));
    const roof = deco.rooftopKit({
      footprintW: lm.footprint[0] * 0.55, footprintD: lm.footprint[1] * 0.55, seed,
    });
    roof.position.y = lm.height * 0.94;
    towerGroup.add(roof);
  }

  // ------------------------------------------------------------------
  // THE HEAVIEST CORNER ON EARTH — the real four (1902-1912), true
  // corners, true heights. Woodward SW, Brown Marx NE, Empire NW,
  // American Trust SE. Prismatic commercial classicism: base/shaft/
  // crown, flat parapets, no spires. Face names follow this file's
  // local convention ('east' = +dx, 'south' = +dz).
  // ------------------------------------------------------------------

  // WOODWARD BUILDING (1902, 10 floors) — SW corner. Chicago-school
  // red-brown brick over a two-story rusticated base.
  {
    const lm = plan.landmarks.find(l => l.id === 'woodward-building');
    towerAt(
      lm,
      { setbacks: 1, material: materials.brick, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'north');
        const shops = deco.storefrontBand({ width: lm.footprint[0], height: 4.6,
          material: materials.brick, awnings: true, seed: 1902 });
        shops.rotation.y = Math.PI;
        shops.position.set(0, 0, -lm.footprint[1] / 2 - 0.05);
        g.add(shops);
        const cor = deco.corniceBox({ width: lm.footprint[0] + 0.8, depth: lm.footprint[1] + 0.8,
          height: 0.9, material: materials.terracotta });
        cor.position.set(0, lm.height - 0.5, 0);
        g.add(cor);
        facadeSign(g, lm, 'WOODWARD', lm.height * 0.3, 10, 'north');
        landmarkDetail(g, lm, materials.brick, 1902);
      }
    );
  }

  // BROWN MARX BUILDING (1906, 16 floors) — NE corner. Buff brick,
  // rusticated stone base with arched openings, bracketed cornice;
  // E-plan light courts suggested by two recessed slots on the alley
  // (north) face.
  {
    const lm = plan.landmarks.find(l => l.id === 'brown-marx-building');
    towerAt(
      lm,
      { setbacks: 1, material: materials.limestone, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'south');
        const base = deco.pilasterFacade({ width: lm.footprint[0], height: 9, bays: 8,
          material: materials.limestone, pilasterMaterial: materials.bronze });
        base.position.set(0, 0, lm.footprint[1] / 2 + 0.25);
        g.add(base);
        for (const nx of [-6, 6]) {
          const slot = new THREE.Mesh(
            new THREE.BoxGeometry(4.5, lm.height * 0.8, 0.9),
            materials.steelDark
          );
          slot.position.set(nx, lm.height * 0.55, -lm.footprint[1] / 2 + 0.2);
          g.add(slot);
        }
        const cor = deco.corniceBox({ width: lm.footprint[0] + 1.2, depth: lm.footprint[1] + 1.2,
          height: 1.1, material: materials.bronze });
        cor.position.set(0, lm.height - 0.6, 0);
        g.add(cor);
        facadeSign(g, lm, 'BROWN MARX', lm.height * 0.3, 13, 'south');
        landmarkDetail(g, lm, materials.limestone, 1906);
      }
    );
  }

  // EMPIRE BUILDING (1909, 16 floors) — NW corner. White glazed
  // terra-cotta; crown = two-story engaged colonnade under a deep
  // modillion cornice, lit warm at night.
  {
    const lm = plan.landmarks.find(l => l.id === 'empire-building');
    towerAt(
      lm,
      { setbacks: 1, material: materials.limestone, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'south');
        entrance(g, lm, 'west');
        const colonnadeY = lm.height - 7.2;
        const colGeo = new THREE.CylinderGeometry(0.42, 0.46, 6.4, 8);
        const perFace = 9;
        const count = perFace * 4;
        const cols = new THREE.InstancedMesh(colGeo, materials.limestone, count);
        const m4 = new THREE.Matrix4();
        let ci = 0;
        const hx = lm.footprint[0] / 2 - 0.6, hz = lm.footprint[1] / 2 - 0.6;
        for (let i = 0; i < perFace; i++) {
          const t = -1 + (2 * i) / (perFace - 1);
          m4.makeTranslation(t * (hx - 1.2), colonnadeY + 3.2, hz);   cols.setMatrixAt(ci++, m4);
          m4.makeTranslation(t * (hx - 1.2), colonnadeY + 3.2, -hz);  cols.setMatrixAt(ci++, m4);
          m4.makeTranslation(hx, colonnadeY + 3.2, t * (hz - 1.2));   cols.setMatrixAt(ci++, m4);
          m4.makeTranslation(-hx, colonnadeY + 3.2, t * (hz - 1.2));  cols.setMatrixAt(ci++, m4);
        }
        cols.instanceMatrix.needsUpdate = true;
        cols.castShadow = true;
        g.add(cols);
        const cor = deco.corniceBox({ width: lm.footprint[0] + 2.8, depth: lm.footprint[1] + 2.8,
          height: 1.2, material: materials.limestone });
        cor.position.set(0, lm.height - 0.4, 0);
        g.add(cor);
        const crownGlow = new THREE.Mesh(
          new THREE.BoxGeometry(lm.footprint[0] - 1.2, 0.5, lm.footprint[1] - 1.2),
          materials.marquee
        );
        crownGlow.position.set(0, colonnadeY + 0.3, 0);
        g.add(crownGlow);
        facadeSign(g, lm, 'EMPIRE', lm.height * 0.3, 9, 'south');
        landmarkDetail(g, lm, materials.limestone, 1909);
      }
    );
  }

  // AMERICAN TRUST & SAVINGS BANK (1912, 21 floors) — SE corner, the
  // tallest of the four. Three-story banking base with tall arched
  // windows, buff shaft, terra-cotta crown, rooftop sign frame.
  {
    const lm = plan.landmarks.find(l => l.id === 'american-trust-building');
    towerAt(
      lm,
      { setbacks: 1, material: materials.limestone, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'north');
        entrance(g, lm, 'east');
        const base = deco.pilasterFacade({ width: lm.footprint[0], height: 11, bays: 5,
          material: materials.limestone, pilasterMaterial: materials.bronze });
        base.rotation.y = Math.PI;
        base.position.set(0, 0, -lm.footprint[1] / 2 - 0.25);
        g.add(base);
        const crown = deco.corniceBox({ width: lm.footprint[0] + 1.4, depth: lm.footprint[1] + 1.4,
          height: 1.2, material: materials.terracotta });
        crown.position.set(0, lm.height - 0.6, 0);
        g.add(crown);
        const signBack = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 0.4), materials.steelDark);
        signBack.position.set(0, lm.height + 1.8, 0);
        g.add(signBack);
        const roofSign = deco.canvasSign('AMERICAN TRUST', { width: 13 });
        roofSign.position.set(0, lm.height + 1.1, 0.35);
        g.add(roofSign);
        facadeSign(g, lm, 'AMERICAN TRUST & SAVINGS', lm.height * 0.28, 15, 'north');
        landmarkDetail(g, lm, materials.limestone, 1912);
      }
    );
  }

  // CITY FEDERAL BUILDING (1913, 27 floors) — 2nd Ave N & 21st St.
  // Tallest in Alabama 1913-1969: pale neoclassical shaft, three-story
  // arcaded crown, heavy cornice, corner flagpole. The skyline king.
  {
    const lm = plan.landmarks.find(l => l.id === 'city-federal-building');
    towerAt(
      lm,
      { setbacks: 1, material: materials.limestone, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'west');
        const arcY = lm.height - 11;
        const arc = new THREE.Mesh(
          new THREE.BoxGeometry(lm.footprint[0] + 0.4, 10, lm.footprint[1] + 0.4),
          materials.limestone
        );
        arc.position.set(0, arcY + 5, 0);
        g.add(arc);
        const openGeo = new THREE.PlaneGeometry(2.2, 7.5);
        const perFace = 6;
        const opens = new THREE.InstancedMesh(openGeo, materials.glassNight, perFace * 4);
        const m4 = new THREE.Matrix4(); const e = new THREE.Euler();
        let oi = 0;
        const hx = lm.footprint[0] / 2 + 0.25, hz = lm.footprint[1] / 2 + 0.25;
        for (let i = 0; i < perFace; i++) {
          const t = -1 + (2 * i) / (perFace - 1);
          m4.makeTranslation(t * (hx - 2.4), arcY + 5, hz); opens.setMatrixAt(oi++, m4);
          m4.makeRotationY(Math.PI); m4.setPosition(t * (hx - 2.4), arcY + 5, -hz); opens.setMatrixAt(oi++, m4);
          m4.makeRotationY(Math.PI / 2); m4.setPosition(hx, arcY + 5, t * (hz - 2.4)); opens.setMatrixAt(oi++, m4);
          m4.makeRotationY(-Math.PI / 2); m4.setPosition(-hx, arcY + 5, t * (hz - 2.4)); opens.setMatrixAt(oi++, m4);
        }
        opens.instanceMatrix.needsUpdate = true;
        g.add(opens);
        const cor = deco.corniceBox({ width: lm.footprint[0] + 2.2, depth: lm.footprint[1] + 2.2,
          height: 1.3, material: materials.limestone });
        cor.position.set(0, lm.height - 0.5, 0);
        g.add(cor);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 6), materials.steelDark);
        pole.position.set(lm.footprint[0] / 2 - 1.2, lm.height + 4.5, lm.footprint[1] / 2 - 1.2);
        g.add(pole);
        facadeSign(g, lm, 'CITY FEDERAL', lm.height * 0.3, 12, 'west');
        landmarkDetail(g, lm, materials.limestone, 1913);
      }
    );
  }

  // WATTS BUILDING (1927, 16 floors) — 3rd Ave N & 20th St. The art
  // deco one: vertical pier emphasis, polychrome terra-cotta crown
  // band, stepped parapet.
  {
    const lm = plan.landmarks.find(l => l.id === 'watts-building');
    towerAt(
      lm,
      { setbacks: 1, material: materials.limestone, windowMaterial: materials.glassNight },
      g => {
        entrance(g, lm, 'north');
        const piers = deco.pilasterFacade({ width: lm.footprint[0], height: lm.height * 0.55, bays: 7,
          material: materials.limestone, pilasterMaterial: materials.terracotta });
        piers.rotation.y = Math.PI;
        piers.position.set(0, 0, -lm.footprint[1] / 2 - 0.2);
        g.add(piers);
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(lm.footprint[0] + 0.6, 2.4, lm.footprint[1] + 0.6),
          materials.terracotta
        );
        band.position.set(0, lm.height - 3.6, 0);
        g.add(band);
        for (let i = 0; i < 3; i++) {
          const step = new THREE.Mesh(
            new THREE.BoxGeometry(lm.footprint[0] - i * 5, 1.1, lm.footprint[1] - i * 5),
            materials.limestone
          );
          step.position.set(0, lm.height - 0.9 + i * 1.1, 0);
          g.add(step);
        }
        facadeSign(g, lm, 'WATTS', lm.height * 0.3, 8, 'north');
        landmarkDetail(g, lm, materials.limestone, 1927);
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
  // Facade Detail pass: every brick infill building also gets a
  // deco.fireEscape zigzag stair on its blind east side wall (period
  // brick-building convention — cheap instanced/merged geometry, 2 draw
  // calls per building regardless of floor count).
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
        // Fire escape on the east blind wall, brick buildings only.
        if (matName === 'brick') {
          const fe = deco.fireEscape({
            height: h - 2, floors: Math.max(3, Math.round(h / 3.5)),
            width: Math.min(1.6, sz * 0.3),
          });
          fe.rotation.y = Math.PI / 2;
          fe.position.set(x + sx / 2 + 0.05, 0.4, z);
          group.add(fe);
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
  // Facade Detail pass — storefront awnings + blade signs along the
  // avenues near the Corner, with period business names drawn from the
  // World Bible's price canon (Section 5: haircut 25¢, shoeshine 5¢,
  // coffee 15¢, Lucky Strike 10¢). Mounted just above the sidewalk
  // strips flanking 20th St N and 1st Ave N. 6 spots x (1 awning mesh +
  // 2 shopSign meshes) = 18 draw calls.
  // ------------------------------------------------------------------
  const storefrontSpots = [
    { x: -13.4, z: -34, rotY: Math.PI / 2, name: 'CORNER LUNCH — COFFEE 15¢' },
    { x: 13.4, z: -34, rotY: -Math.PI / 2, name: 'MAGIC CITY BARBER — HAIRCUT 25¢' },
    { x: -13.4, z: 36, rotY: Math.PI / 2, name: 'IMPERIAL CIGAR & TOBACCO — LUCKY STRIKE 10¢' },
    { x: 13.4, z: 36, rotY: -Math.PI / 2, name: 'HEAVIEST CORNER DRUG CO.' },
    { x: 40, z: 13.6, rotY: Math.PI, name: 'VALLEY SHOE SHINE — 5¢' },
    { x: -40, z: 13.6, rotY: 0, name: 'CROWN LUNCH COUNTER — SANDWICH 10¢' },
  ];
  for (const spot of storefrontSpots) {
    const aw = deco.awning({ width: 3.4, projection: 1.5, seed: Math.round(spot.x * 3 + spot.z) || 1 });
    aw.position.set(spot.x, 3.4, spot.z);
    aw.rotation.y = spot.rotY;
    group.add(aw);
    const sign = deco.shopSign(spot.name, { width: 2.0 });
    sign.position.set(spot.x, 3.9, spot.z);
    sign.rotation.y = spot.rotY;
    group.add(sign);
  }

  // ------------------------------------------------------------------
  // Street furniture: lamps, benches, newsstand, hydrant-free corners
  // ------------------------------------------------------------------
  {
    const lampSpots = [
      [-13, -40], [13, -40], [-13, 30], [13, 30], [-13, 44], [13, 44],
      [-120, 50], [120, 50], [-40, 13], [40, 13], [110, 13], [170, 13],
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
    body: '"EXTRA! BARONS TAKE THE SOUTHERN PENNANT — CROWDS PACK RICKWOOD FIELD! LEDGER, TWO CENTS!"',
  });

  // 3. Painted wall advertisement on an infill wall (Age-Herald back page).
  const paintedAd = deco.canvasSign('MADE WHERE IT’S MINED!', { width: 14, canvasWidth: 512, canvasHeight: 160 });
  paintedAd.position.set(86 - 12.4, 9, -64);
  paintedAd.rotation.y = -Math.PI / 2;
  group.add(paintedAd);
  registerInteractive(paintedAd.children[0], {
    title: 'Painted Advertisement — TC Iron',
    body: '"MADE WHERE IT\'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, and fire. TC IRON — THE SOUTH\'S OWN METAL."',
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
      { side: 'north', from: -59, to: -13 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // ------------------------------------------------------------------
  // STREET-WALL FAN-OUT — DOWNTOWN CORE (heaviest-corner assigned
  // blocks). Continuous 1929 party-wall street fabric for the seven
  // downtown-core blocks assigned to this fan-out pass. Existing AABBs
  // (landmark towers / background infill already elsewhere in this file)
  // are expressed as frontage gaps with 2 m clearance. seed = x0*7 + z0
  // per block, deterministic across reruns. This section is purely
  // additive — nothing above it is modified.
  // ------------------------------------------------------------------

  // Block A: x -228..-132, z -268..-152. Existing AABB [-211,-259,-189,-241,14]
  // sits within north-facing lot depth (z -268..~-248) and, via its
  // z-extent, could also collide with west-facing lot depth near x -228.
  // Gap both frontages with 2 m clearance.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: -1864,
    block: { x0: -228, z0: -268, x1: -132, z1: -152 },
    gaps: [
      { side: 'north', from: -213, to: -187 },
      { side: 'west', from: -261, to: -239 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block B: x 12..108, z -268..-152. No existing structures.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: -184,
    block: { x0: 12, z0: -268, x1: 108, z1: -152 },
    gaps: [],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block C: x 132..228, z -268..-152. No existing structures.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: 656,
    block: { x0: 132, z0: -268, x1: 228, z1: -152 },
    gaps: [],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block D: x -228..-132, z -128..-12. Existing AABB
  // [-210,-83,-190,-67,14] sits within west-facing lot depth near the
  // block's north-west quadrant; existing AABB [-231,-28,-209,-12,14]
  // sits on the south-west corner, touching BOTH the south frontage
  // (z1=-12 is its own edge) and the west-facing lot depth. Gap all
  // three touched frontage stretches with 2 m clearance.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: -1724,
    block: { x0: -228, z0: -128, x1: -132, z1: -12 },
    gaps: [
      { side: 'west', from: -85, to: -65 },
      { side: 'west', from: -30, to: -10 },
      { side: 'south', from: -233, to: -207 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block E: x -108..-12, z -128..-12. Five existing AABBs union to a
  // stepped tower footprint roughly x -64..-32, z -50..-18 — close
  // enough to the south edge (z1=-12) and east edge (x1=-12) that
  // south- and east-facing party-wall lot depth (up to 20 m) could
  // reach it. Gap both touched frontages with 2 m clearance.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: -884,
    block: { x0: -108, z0: -128, x1: -12, z1: -12 },
    gaps: [
      { side: 'south', from: -66, to: -15 },
      { side: 'east', from: -52, to: -16 },
      { side: 'west', from: -126, to: -96 },
      { side: 'north', from: -109, to: -77 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block F: x 12..108, z -128..-12. Existing AABBs form two clusters:
  // one straddling the west edge (x -7..27, z -27..7) — gapped on the
  // west frontage and, since its x-extent inside the block also lies
  // within south-facing lot depth, on the south frontage too; and a
  // spire cluster (x 34..58, z -28..-4) close to the south edge —
  // gapped on the south frontage. 2 m clearance throughout.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: -44,
    block: { x0: 12, z0: -128, x1: 108, z1: -12 },
    gaps: [
      { side: 'west', from: -29, to: 9 },
      { side: 'south', from: 10, to: 29 },
      { side: 'south', from: 32, to: 60 },
    ],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // Block G: x 132..228, z -128..-12. No existing structures.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: 796,
    block: { x0: 132, z0: -128, x1: 228, z1: -12 },
    gaps: [],
    use: 'commercial', floorsRange: [2, 5], alley: true,
  }));

  // ------------------------------------------------------------------
  // STREET-WALL FAN-OUT — EAST DOWNTOWN + MORRIS WAREHOUSE ROW
  // (heaviest-corner assigned blocks). Continuous 1929 party-wall
  // street fabric via deco.blockFill for the three Morris Avenue
  // warehouse-row blocks assigned to this district (centroid-in-polygon
  // test against both terminal-quarter [x -1200..-160] and
  // heaviest-corner [x -160..220] polygons read from data/city-plan.json).
  // Existing AABBs from the run brief are expressed as frontage gaps
  // with 2 m clearance. seed = x0*7+z0 per block, deterministic across
  // reruns. Warehouse rows face Morris Avenue to the south; alley is
  // disabled per brief rule 2. Purely additive — nothing above this
  // section is modified.
  // ------------------------------------------------------------------

  // Block 8: x -108..-12, z 14..46. warehouse (Morris Ave row). Existing
  // AABB cluster ([-55,5,-29,31,34] etc.) starts north of the block and
  // reaches south to z 31 (17 m into the block), and its east edge (x -29)
  // reaches to within 3 m of the east-frontage lot-depth band.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: -742,
    block: { x0: -108, z0: 14, x1: -12, z1: 46 },
    gaps: [
      { side: 'north', from: -57, to: -17 },
      { side: 'south', from: -57, to: -17 },
      { side: 'east', from: 3, to: 33 },
    ],
    use: 'warehouse', floorsRange: [2, 4], alley: false,
  }));

  // Block 9: x 12..108, z 14..46. warehouse (Morris Ave row). Existing
  // AABB cluster ([26,14,54,42,20] etc.) touches the block's north
  // frontage exactly (z0=14) and reaches to within 4 m of the south
  // frontage (z1=46).
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: 98,
    block: { x0: 12, z0: 14, x1: 108, z1: 46 },
    gaps: [
      { side: 'north', from: 16, to: 56 },
      { side: 'south', from: 16, to: 56 },
    ],
    use: 'warehouse', floorsRange: [2, 4], alley: false,
  }));

  // Block 10: x 132..228, z 14..46. warehouse (Morris Ave row), no
  // existing structures. Extends 8 m past the polygon's east edge (220)
  // at its far corner into alabama-way's declared territory; kept as
  // one rect per the brief's given block coordinates.
  group.add(deco.blockFill({
    THREE: T, materials, deco, seed: 938,
    block: { x0: 132, z0: 14, x1: 228, z1: 46 },
    gaps: [],
    use: 'warehouse', floorsRange: [2, 4], alley: false,
  }));

  scene.add(group);
}
