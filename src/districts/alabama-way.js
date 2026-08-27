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
 * WBRC & WAPI studio block, street furniture and four verbatim readables
 * fill out the strip.
 *
 * Densification pass (District Densifier): tightened background infill
 * (tier 1), a dedicated continuous two-row street wall along the spine
 * with deliberate alley gaps (tier 4), a residential fringe of four house
 * archetypes with porches/gables/chimneys reusing the SAME instanced
 * arrays as the commercial infill (tier 2), street trees built by
 * instancing deco.tree()'s own geometry across many positions (tier 3),
 * low garden-lot hedges, back-alley sheds, and extra marquee/blade
 * signage and cafe fronts near Club Savoy (tier 4).
 *
 * Performance: every repeated building part (bodies, cornices, doorways,
 * windows, porch posts, porch roofs, steps, gable roof slabs, hedges,
 * street trees) is InstancedMesh, so draw-call count stays flat regardless
 * of how many buildings/houses/trees are added — only the two plan
 * landmarks, the studio block, a handful of sheds and ~7 unique signs use
 * individual meshes. Estimated total added draw calls for this pass is
 * ~24, well under the +120 budget.
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
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  unitCylinder.translate(0, 0.5, 0); // pivot at bottom-center

  const limestoneBodies = [];
  const brickBodies = [];
  const cornices = []; // also doubles as porch-roof canopies (terracotta, unitBox)
  const doorStrips = []; // also doubles as house front doors (bronze, unitBox)
  const dayWindows = [];
  const nightWindows = [];

  // New tier 2/3 accumulators — houses & street green, all instanced.
  const postMats = []; // porch posts (bronze, unitCylinder)
  const stepMats = []; // front steps (sidewalk, unitBox)
  const roofTerracottaMats = []; // gable roof slabs, terracotta tile
  const roofSteelMats = []; // gable roof slabs, dark slate
  const hedgeMats = []; // low garden hedges / lot walls (foliage, unitBox)

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

  // Single-row window rhythm for short residential facades (bungalow scale).
  function pushHouseWindows(x, z, w, d, h, frontSign) {
    const cols = w > 9 ? 3 : 2;
    const spacingX = w / (cols + 1);
    const winW = Math.min(1.3, spacingX * 0.5);
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, frontSign > 0 ? 0 : Math.PI, 0)
    );
    const ly = h * 0.52;
    for (let c = 0; c < cols; c++) {
      const lx = (c - (cols - 1) / 2) * spacingX;
      const pz = z + frontSign * (d / 2 + 0.05);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x + lx, ly, pz), quat, new THREE.Vector3(winW, 1.5, 1)
      );
      (Math.random() < 0.3 ? nightWindows : dayWindows).push(m);
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

  // Gabled roof: two tilted rectangular slabs meeting at a ridge running
  // along local X (parallel to the street row). Pushed as two oriented-box
  // instance matrices into a shared InstancedMesh — no custom geometry.
  function pushGableRoof(x, z, w, d, eaveH, rise, overhang, roofArr) {
    const halfSpan = d / 2 + overhang;
    const slopeLen = Math.sqrt(halfSpan * halfSpan + rise * rise);
    const theta = Math.atan2(rise, halfSpan);
    const qPos = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), theta);
    const qNeg = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -theta);
    const midY = eaveH + rise / 2;
    const thick = 0.16;
    roofArr.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, midY, z + halfSpan / 2), qPos, new THREE.Vector3(w + 0.6, thick, slopeLen)
    ));
    roofArr.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, midY, z - halfSpan / 2), qNeg, new THREE.Vector3(w + 0.6, thick, slopeLen)
    ));
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
  const streetZs = [-280, -140, 0, 140];
  function nearStreet(x, z) {
    for (const sx of streetXs) if (Math.abs(x - sx) < 11) return true;
    for (const sz of streetZs) if (Math.abs(z - sz) < 16) return true;
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

  // Tier 1 — tightened grid (denser, smaller skip chance) so street
  // frontage reads continuous rather than gap-toothed. Skipped cells
  // still get a deliberate garden-lot hedge roughly half the time instead
  // of a bare gap ("every lot has a structure or a deliberate lot use").
  for (let gx = 244; gx <= 596; gx += 30) {
    for (let gz = -300; gz <= 176; gz += 34) {
      if (rnd() < 0.08) {
        if (rnd() < 0.5) {
          hedgeMats.push(new THREE.Matrix4().compose(
            new THREE.Vector3(gx, 0, gz), new THREE.Quaternion(), new THREE.Vector3(9, 0.7, 0.5)
          ));
        }
        continue;
      }
      const jx = gx + (rnd() - 0.5) * 10;
      const jz = gz + (rnd() - 0.5) * 12;
      if (nearStreet(jx, jz)) continue;
      const nearStrip = Math.abs(jz + 140) < 90;
      const w = 13 + rnd() * 9;
      const d = 11 + rnd() * 7;
      const h = nearStrip ? 15 + rnd() * 15 : 8 + rnd() * 9;
      if (overlapsExcluded(jx, jz, w + 2, d + 2)) continue;
      addInfillBuilding(jx, jz, w, d, h);
    }
  }

  // Tier 4 — Alabama Way spine: a dedicated continuous two-to-four-story
  // street wall on both sidewalks, broken only at three deliberate
  // service-alley gaps (no random gap-toothing on the show street).
  function buildSpineStreetWall() {
    const alleyXs = [318, 448, 528];
    const rowZs = [-153, -127];
    for (const rz of rowZs) {
      let x = 252;
      while (x <= 588) {
        const nearAlley = alleyXs.some((ax) => Math.abs(x - ax) < 5);
        const onCrossStreet = streetXs.some((sx) => Math.abs(x - sx) < 11);
        if (!nearAlley && !onCrossStreet) {
          const w = 15 + rnd() * 5;
          const d = 12 + rnd() * 4;
          const h = 11 + rnd() * 10;
          if (!overlapsExcluded(x, rz, w + 2, d + 2)) addInfillBuilding(x, rz, w, d, h);
        }
        x += 17 + rnd() * 5;
      }
    }
  }
  buildSpineStreetWall();

  // Tier 2/3 — residential fringe: four house archetypes lining a quiet
  // side street along the district's south edge (z≈202), fronting north
  // toward the neighborhood. Every part reuses the shared instanced
  // arrays above, so hundreds of houses would still cost zero extra
  // draw calls beyond the five new arrays flushed once at the end.
  const ARCHETYPES = [
    { w: 8.5, d: 9.4, eave: 4.3, rise: 2.2, body: 'brick', roof: 'terracotta' },
    { w: 9.5, d: 9.4, eave: 4.6, rise: 2.6, body: 'limestone', roof: 'steel' },
    { w: 7.6, d: 9.0, eave: 4.0, rise: 2.0, body: 'brick', roof: 'steel' },
    { w: 10.2, d: 9.8, eave: 4.8, rise: 2.8, body: 'limestone', roof: 'terracotta' },
  ];

  function buildHouseRow() {
    const rowZ = 202;
    const frontSign = -1; // porches face north, into the neighborhood
    let hx = 254;
    let idx = 0;
    let prevEdge = null;
    while (hx <= 592) {
      const arc = ARCHETYPES[idx % ARCHETYPES.length];
      const z = rowZ + (rnd() - 0.5) * 3;
      const { w, d } = arc;
      const eaveH = arc.eave, rise = arc.rise;
      const onCrossStreet = streetXs.some((sx) => Math.abs(hx - sx) < 11);
      if (!onCrossStreet && !overlapsExcluded(hx, z, w + 2, d + 2)) {
        const bodyM = new THREE.Matrix4().compose(
          new THREE.Vector3(hx, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, eaveH, d)
        );
        (arc.body === 'brick' ? brickBodies : limestoneBodies).push(bodyM);

        pushGableRoof(hx, z, w, d, eaveH, rise, 0.6,
          arc.roof === 'terracotta' ? roofTerracottaMats : roofSteelMats);

        // Brick chimney, always — regardless of body material.
        brickBodies.push(new THREE.Matrix4().compose(
          new THREE.Vector3(hx + w * 0.32, 0, z - d * 0.3), new THREE.Quaternion(),
          new THREE.Vector3(0.6, eaveH + rise + 1.0, 0.6)
        ));

        // Porch roof (reuses the terracotta cornice array as a flat canopy).
        cornices.push(new THREE.Matrix4().compose(
          new THREE.Vector3(hx, eaveH * 0.56, z - d / 2 - 1.1),
          new THREE.Quaternion(), new THREE.Vector3(w * 0.62, 0.2, 2.2)
        ));

        // Porch posts.
        const postH = eaveH * 0.56;
        for (const sx of [-1, 1]) {
          postMats.push(new THREE.Matrix4().compose(
            new THREE.Vector3(hx + sx * w * 0.27, 0, z - d / 2 - 2.0),
            new THREE.Quaternion(), new THREE.Vector3(0.14, postH, 0.14)
          ));
        }

        // Front steps.
        stepMats.push(new THREE.Matrix4().compose(
          new THREE.Vector3(hx, 0, z - d / 2 - 2.55), new THREE.Quaternion(),
          new THREE.Vector3(1.6, 0.3, 0.9)
        ));

        // Front door (reuses the bronze doorStrips array).
        doorStrips.push(new THREE.Matrix4().compose(
          new THREE.Vector3(hx, 0.15, z - d / 2 - 0.05), new THREE.Quaternion(),
          new THREE.Vector3(w * 0.16, 2.2, 0.1)
        ));

        pushHouseWindows(hx, z, w, d, eaveH, frontSign);

        // Low hedge between this house and the previous one.
        if (prevEdge !== null) {
          const leftEdge = hx - w / 2;
          const span = leftEdge - prevEdge;
          if (span > 1.2) {
            hedgeMats.push(new THREE.Matrix4().compose(
              new THREE.Vector3((prevEdge + leftEdge) / 2, 0, z - d / 2 - 3.4),
              new THREE.Quaternion(), new THREE.Vector3(span * 0.7, 0.6, 0.5)
            ));
          }
        }
        prevEdge = hx + w / 2;
      } else {
        prevEdge = null;
      }
      hx += 22 + rnd() * 6;
      idx++;
    }
  }
  buildHouseRow();

  // Tier 3 — back-alley sheds behind the house row (few, individual).
  function buildSheds() {
    const shedSpots = [[300, 214], [380, 213], [460, 215], [540, 212]];
    for (const [sx, sz] of shedSpots) {
      if (overlapsExcluded(sx, sz, 5, 5)) continue;
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.6), materials.steelDark);
      body.position.set(sx, 1.2, sz);
      group.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 3), materials.terracotta);
      roof.position.set(sx, 2.5, sz);
      group.add(roof);
    }
  }
  buildSheds();

  // ---------------- flush every instanced accumulator (one draw call each) ----------------
  if (limestoneBodies.length) group.add(makeInstanced(limestoneBodies, materials.limestone));
  if (brickBodies.length) group.add(makeInstanced(brickBodies, materials.brick));
  if (cornices.length) group.add(makeInstanced(cornices, materials.terracotta));
  if (doorStrips.length) group.add(makeInstanced(doorStrips, materials.bronze));
  if (dayWindows.length) group.add(makeInstanced(dayWindows, materials.glassDay, unitPlane));
  if (nightWindows.length) group.add(makeInstanced(nightWindows, materials.glassNight, unitPlane));
  if (postMats.length) group.add(makeInstanced(postMats, materials.bronze, unitCylinder));
  if (stepMats.length) group.add(makeInstanced(stepMats, materials.sidewalk));
  if (roofTerracottaMats.length) group.add(makeInstanced(roofTerracottaMats, materials.terracotta));
  if (roofSteelMats.length) group.add(makeInstanced(roofSteelMats, materials.steelDark));
  if (hedgeMats.length) group.add(makeInstanced(hedgeMats, materials.foliage));

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

  // ================= STREET-WALL FAN-OUT: WEST DOWNTOWN + MORRIS WEST =================
  // blockFill() calls for this district's assigned frontage blocks (campaign
  // fanout-b2, task STREET-WALL FAN-OUT — WEST DOWNTOWN + MORRIS WEST). Purely
  // additive: reuses src/engine/deco-blockfill.js (deco.blockFill) to fill
  // continuous 1929 street-wall fabric on the pilot-proven generator.
  // seed = x0*7 + z0 per block (fan-out rule 1) — stable across reruns.
  // Existing-structure AABBs from the run brief are expressed as gaps on
  // whichever frontage(s) they touch, extent + 2m clearance each side
  // (fan-out rule 3); where the extent also risks colliding with
  // perimeter lots on a different frontage of the same block, that
  // frontage gets its own narrow gap too rather than shrinking the rect.
  buildStreetWallFanout();
  function buildStreetWallFanout() {
    // --- West Downtown, north row (z -268..-152) ---
    group.add(deco.blockFill({
      deco, seed: 1496, // 252*7 + -268
      block: { x0: 252, z0: -268, x1: 348, z1: -152 },
      use: 'commercial', floorsRange: [2, 5],
    }));
    group.add(deco.blockFill({
      deco, seed: 2336, // 372*7 + -268
      block: { x0: 372, z0: -268, x1: 468, z1: -152 },
      use: 'commercial', floorsRange: [2, 5],
    }));
    // Existing landmark AABBs [546,-271,574,-249,9] & [549,-269,571,-251,13]
    // both sit on the north (z0) frontage; combined x-extent 546-574,
    // +2m clearance each side -> gap 544-576.
    group.add(deco.blockFill({
      deco, seed: 3176, // 492*7 + -268
      block: { x0: 492, z0: -268, x1: 588, z1: -152 },
      use: 'commercial', floorsRange: [2, 5],
      gaps: [{ side: 'north', from: 544, to: 576 }],
    }));

    // --- West Downtown, south row (z -128..-12) ---
    group.add(deco.blockFill({
      deco, seed: 1636, // 252*7 + -128
      block: { x0: 252, z0: -128, x1: 348, z1: -12 },
      use: 'commercial', floorsRange: [2, 5],
    }));
    // Existing AABBs [359,-106,401,-34,17] & [370,-59,390,-38,24] straddle
    // the west (x0=372) frontage line (extent z -106..-34, +2m clearance ->
    // gap -108..-32). Their x-extent (359-401) reaches 29m into the block,
    // deep enough that north/south perimeter lots landing in that same x
    // range risk colliding too, so that x-range (+2m clearance -> 370-403)
    // is also gapped on north and south rather than shrinking the rect.
    group.add(deco.blockFill({
      deco, seed: 2476, // 372*7 + -128
      block: { x0: 372, z0: -128, x1: 468, z1: -12 },
      use: 'commercial', floorsRange: [2, 5],
      gaps: [
        { side: 'west', from: -108, to: -32 },
        { side: 'north', from: 370, to: 403 },
        { side: 'south', from: 370, to: 403 },
      ],
    }));
    group.add(deco.blockFill({
      deco, seed: 3316, // 492*7 + -128
      block: { x0: 492, z0: -128, x1: 588, z1: -12 },
      use: 'commercial', floorsRange: [2, 5],
    }));

    // --- Morris West warehouse row (z 14..46) ---
    // Existing AABB [289,17,311,43,12] runs nearly the full block depth
    // (14-46), only 3m in from BOTH the north and south frontage — well
    // inside a typical warehouse lot's 14-20m depth from either side, so
    // it is gapped on both, x-extent 289-311 + 2m clearance -> 287-313.
    group.add(deco.blockFill({
      deco, seed: 1778, // 252*7 + 14
      block: { x0: 252, z0: 14, x1: 348, z1: 46 },
      use: 'warehouse', floorsRange: [2, 4], alley: false,
      gaps: [
        { side: 'north', from: 287, to: 313 },
        { side: 'south', from: 287, to: 313 },
      ],
    }));
    group.add(deco.blockFill({
      deco, seed: 2618, // 372*7 + 14
      block: { x0: 372, z0: 14, x1: 468, z1: 46 },
      use: 'warehouse', floorsRange: [2, 4], alley: false,
    }));
    group.add(deco.blockFill({
      deco, seed: 3458, // 492*7 + 14
      block: { x0: 492, z0: 14, x1: 588, z1: 46 },
      use: 'warehouse', floorsRange: [2, 4], alley: false,
    }));
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

  // benches & curb cars — instanced.
  const benchMats = [];
  const carMats = [];
  for (let x = 260; x <= 580; x += 70) {
    benchMats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, -132), new THREE.Quaternion(), new THREE.Vector3(1.5, 0.44, 0.5)
    ));
    carMats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x + 20, 0, -146), new THREE.Quaternion(), new THREE.Vector3(4.3, 1.3, 1.7)
    ));
  }
  if (benchMats.length) group.add(makeInstanced(benchMats, materials.bronze));
  if (carMats.length) group.add(makeInstanced(carMats, materials.steelDark));

  // Street trees — real deco.tree() geometry, instanced by hand across many
  // positions (3 size classes = 3 draw calls total for every tree on the
  // block), replacing the old placeholder sphere-on-a-stick trees.
  function buildStreetTrees() {
    const smallRef = deco.tree({ height: 5, seed: 4471 });
    const medRef = deco.tree({ height: 6.4, seed: 8821 });
    const largeRef = deco.tree({ height: 7.6, seed: 1237 });
    const smallM = [], medM = [], largeM = [];
    const spots = [];
    for (let x = 258; x <= 588; x += 34) spots.push([x, 178]);
    for (let x = 262; x <= 588; x += 46) spots.push([x, -300]);
    for (let i = 0; i < spots.length; i++) {
      const [tx, tz] = spots[i];
      if (overlapsExcluded(tx, tz, 3, 3)) continue;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(tx, 0, tz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)
      );
      const bucket = i % 3;
      (bucket === 0 ? smallM : bucket === 1 ? medM : largeM).push(m);
    }
    if (smallM.length) group.add(makeInstanced(smallM, smallRef.material, smallRef.geometry));
    if (medM.length) group.add(makeInstanced(medM, medRef.material, medRef.geometry));
    if (largeM.length) group.add(makeInstanced(largeM, largeRef.material, largeRef.geometry));
  }
  buildStreetTrees();

  // Tier 4 — extra marquees, vertical blade signs and cafe/club fronts.
  function buildMarqueesAndBlades() {
    const blades = [
      { x: 270, z: -128, text: 'CAFE DE LUXE' },
      { x: 330, z: -153, text: 'RITZ CIGARS' },
      { x: 400, z: -128, text: 'MAJESTIC ROOMS' },
      { x: 500, z: -153, text: 'PALACE BILLIARDS' },
      { x: 560, z: -128, text: 'HOTEL AVALON' },
    ];
    for (const b of blades) {
      if (overlapsExcluded(b.x, b.z, 4, 4)) continue;
      const frontSign = frontSignFor(b.z);
      const blade = deco.canvasSign(b.text, { width: 6, canvasWidth: 512, canvasHeight: 160 });
      blade.rotation.z = Math.PI / 2;
      if (frontSign < 0) blade.rotation.y = Math.PI;
      blade.position.set(b.x, 5.4, b.z + frontSign * 0.3);
      group.add(blade);
    }

    const cafeSigns = [
      { x: 268, z: 8, text: 'BLUE NOTE CAFE' },
      { x: 330, z: 46, text: 'DOMINO CLUB' },
    ];
    for (const s of cafeSigns) {
      if (overlapsExcluded(s.x, s.z, 4, 4)) continue;
      const sign = deco.canvasSign(s.text, { width: 6.5, canvasWidth: 512, canvasHeight: 160 });
      sign.position.set(s.x, 6.2, s.z);
      group.add(sign);
    }
  }
  buildMarqueesAndBlades();

  // Club Savoy interior (dynamic, optional; never edits other files)
  try {
    const savoy = await import('./alabama-way-savoy.js');
    await savoy.build(ctx);
    if (savoyLM) savoy.wireDoor(ctx, savoyLM, frontSignFor(savoyLM.position[1]));
  } catch (err) { console.warn('[magic-city] club-savoy interior skipped', err && err.message); }
}
