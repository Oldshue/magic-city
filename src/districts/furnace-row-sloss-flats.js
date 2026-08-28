/**
 * furnace-row-sloss-flats.js — District Architect module for
 * "Furnace Row / Sloss Flats" (industrial north valley floor).
 *
 * World Bible character: Sloss Furnaces, pipe foundries, casting sheds
 * under a permanent low orange dome; blowing-engine heartbeat, whistle
 * shifts, crane bells, hiss of quench, coal smoke. City-plan notes call
 * for loose industrial parcels on a coarse grid with a rail belt along
 * the south edge feeding Sloss. Twin hot-blast stoves, drifting smoke
 * columns, and molten underlighting near the cast sheds carry the furnace
 * glow onto the north-east horizon after dark.
 *
 * Exports: export async function build(ctx)
 */

export async function build(ctx) {
  const { THREE, scene, plan, district, materials, deco, registerInteractive } = ctx;
  const { corniceBox, pilasterFacade, finial, windowGrid, canvasSign, streetlamp, decoDoorway, setbackTower } = deco;

  const root = new THREE.Group();
  root.name = 'district:furnace-row-sloss-flats';
  scene.add(root);

  // District bounds, computed from the law polygon (never hardcoded).
  const xs = district.polygon.map((p) => p[0]);
  const zs = district.polygon.map((p) => p[1]);
  const B = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };

  const landmarks = plan.landmarks.filter((l) => l.district === district.slug);
  const byId = (id) => landmarks.find((l) => l.id === id);

  // ---------------------------------------------------------------- helpers
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(19290826);

  function box(w, h, d, material) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  }
  function cyl(rt, rb, h, seg, material) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  }

  /** Build an InstancedMesh from a shared geometry/material and a transform list.
   * transforms: [{ pos:[x,y,z], euler?:[ex,ey,ez], scale?:[sx,sy,sz] }] */
  function instanced(geometry, material, transforms) {
    const inst = new THREE.InstancedMesh(geometry, material, transforms.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    transforms.forEach((t, i) => {
      const eu = t.euler || [0, 0, 0];
      e.set(eu[0], eu[1], eu[2]);
      q.setFromEuler(e);
      const sc = t.scale || [1, 1, 1];
      s.set(sc[0], sc[1], sc[2]);
      p.set(t.pos[0], t.pos[1], t.pos[2]);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    inst.receiveShadow = false;
    return inst;
  }

  function place(obj, x, z, rotYDeg) {
    obj.position.x += x;
    obj.position.z += z;
    if (rotYDeg) obj.rotation.y += THREE.MathUtils.degToRad(rotYDeg);
    return obj;
  }

  // Cached soft-round smoke sprite texture (one canvas, reused by every puff).
  let _smokeTex = null;
  function makeSmokeTexture() {
    if (_smokeTex) return _smokeTex;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(210,205,196,0.85)');
    grad.addColorStop(0.55, 'rgba(180,175,168,0.35)');
    grad.addColorStop(1, 'rgba(160,155,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    _smokeTex = new THREE.CanvasTexture(c);
    _smokeTex.colorSpace = THREE.SRGBColorSpace;
    return _smokeTex;
  }

  /** A slow-drifting smoke column of camera-facing sprites (auto-billboard,
   * no per-frame code needed). Transparent glow planes — always noShadow. */
  function buildSmokeColumn(x, baseY, z, seed) {
    const rng = mulberry32(seed);
    const tex = makeSmokeTexture();
    const group = new THREE.Group();
    let dx = 0, dz = 0;
    const puffCount = 5;
    for (let i = 0; i < puffCount; i++) {
      const t = i / (puffCount - 1);
      const y = baseY + t * 50 + rng() * 4;
      dx += (rng() - 0.15) * 7; // drifts downwind as it rises
      dz += (rng() - 0.5) * 3;
      const scale = 6 + t * 15 + rng() * 3;
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: 0.3 * (1 - t * 0.5), color: 0xcac4b8,
      });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(scale, scale * 1.2, 1);
      spr.position.set(x + dx, y, z + dz);
      spr.userData.noShadow = true;
      group.add(spr);
    }
    return group;
  }

  /** Orient a unit-height cylinder mesh (already scaled to length 1 along Y)
   * between two local-space points, scaling and rotating it in place. */
  function orientBetween(mesh, p0, p1) {
    const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = dir.length() || 0.001;
    mesh.scale.y = len;
    mesh.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }

  // =====================================================================
  // 1. SLOSS FURNACES — law geometry from data/city-plan.json
  // =====================================================================
  {
    const lm = byId('sloss-furnaces');
    const g = new THREE.Group();
    g.position.set(lm.position[0], 0, lm.position[1]);
    g.rotation.y = THREE.MathUtils.degToRad(lm.rotationYDeg || 0);
    const [fw, fd] = lm.footprint;
    const fh = lm.height;

    // Main cast-iron casting shed — long low hall, brick with a steel monitor roof.
    const shedH = fh * 0.3;
    const shed = box(fw * 0.84, shedH, fd * 0.7, materials.brick);
    shed.position.set(0, shedH / 2, 0);
    g.add(shed);

    const monitor = box(fw * 0.48, shedH * 0.3, fd * 0.28, materials.steelDark);
    monitor.position.set(0, shedH + (shedH * 0.15), 0);
    g.add(monitor);

    // Four blast-furnace stacks staggered along the spine, per the World Bible's
    // "cast-iron cathedral of four stacks, pipes and catwalks."
    const stackR = fw * 0.02;
    const stackH = fh * 0.92;
    const stackXs = [-fw * 0.32, -fw * 0.11, fw * 0.1, fw * 0.31];
    const stackZ = fd * 0.02;

    const stacks = instanced(
      new THREE.CylinderGeometry(stackR, stackR * 1.25, stackH, 12),
      materials.steelDark,
      stackXs.map((x) => ({ pos: [x, stackH / 2, stackZ] }))
    );
    g.add(stacks);

    const caps = instanced(
      new THREE.ConeGeometry(stackR * 1.15, stackR * 2.2, 12),
      materials.brick,
      stackXs.map((x) => ({ pos: [x, stackH + stackR * 1.1, stackZ] }))
    );
    g.add(caps);

    // Molten glow bands low on each stack — "slag pours glow like slow lava."
    const glowH = stackH * 0.08;
    const glows = instanced(
      new THREE.CylinderGeometry(stackR * 1.08, stackR * 1.08, glowH, 12),
      materials.furnaceGlow,
      stackXs.map((x) => ({ pos: [x, stackH * 0.16, stackZ] }))
    );
    g.add(glows);

    // Twin Cowper-style hot-blast stoves flanking the shed — bulbous brick
    // cylinders under domed steel caps, the paired "stoves" that give a
    // blast-furnace plant its cathedral-like silhouette alongside the stacks.
    const stoveR = fw * 0.05;
    const stoveH = fh * 0.5;
    const stovePositions = [
      [-fw * 0.42, -fd * 0.3],
      [fw * 0.42, -fd * 0.3],
    ];
    const stoveGroup = new THREE.Group();
    for (const [sx, sz] of stovePositions) {
      const stove = cyl(stoveR, stoveR * 1.1, stoveH, 14, materials.brick);
      stove.position.set(sx, stoveH / 2, sz);
      stoveGroup.add(stove);
      const stoveDome = new THREE.Mesh(
        new THREE.SphereGeometry(stoveR * 1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        materials.steelDark
      );
      stoveDome.position.set(sx, stoveH, sz);
      stoveGroup.add(stoveDome);
      const stoveGlowRing = cyl(stoveR * 0.55, stoveR * 0.55, stoveH * 0.1, 12, materials.furnaceGlow);
      stoveGlowRing.position.set(sx, stoveH * 0.14, sz);
      stoveGroup.add(stoveGlowRing);
    }
    // Pipe bridge linking the two stoves across the shed roof.
    const stoveBridge = cyl(0.5, 0.5, 1, 8, materials.steelDark);
    orientBetween(stoveBridge,
      [stovePositions[0][0] + stoveR, stoveH * 0.82, stovePositions[0][1]],
      [stovePositions[1][0] - stoveR, stoveH * 0.82, stovePositions[1][1]]);
    stoveGroup.add(stoveBridge);
    // Diagonal risers tying each stove into the nearest stack — pipework bridges.
    stovePositions.forEach(([sx, sz], i) => {
      const targetX = stackXs[i === 0 ? 0 : stackXs.length - 1];
      const riser = cyl(0.4, 0.4, 1, 8, materials.steelDark);
      orientBetween(riser, [sx, stoveH * 0.75, sz], [targetX, stackH * 0.2, stackZ]);
      stoveGroup.add(riser);
    });
    g.add(stoveGroup);

    // Slow-drifting smoke columns atop each stack — billboard sprite puffs.
    stackXs.forEach((x, i) => {
      g.add(buildSmokeColumn(x, stackH + stackR, stackZ, 9001 + i * 77));
    });

    // Horizontal pipe runs and catwalks knitting the stacks together.
    const pipeY = stackH * 0.62;
    const pipeTransforms = [];
    const catwalkTransforms = [];
    for (let i = 0; i < stackXs.length - 1; i++) {
      const x0 = stackXs[i], x1 = stackXs[i + 1];
      const mid = (x0 + x1) / 2;
      const len = Math.abs(x1 - x0) - stackR * 2;
      pipeTransforms.push({ pos: [mid, pipeY, stackZ], euler: [0, 0, Math.PI / 2], scale: [1, len / 1, 1] });
      catwalkTransforms.push({ pos: [mid, pipeY * 0.7, stackZ + fd * 0.05], scale: [len, 1, 1] });
    }
    const pipes = instanced(new THREE.CylinderGeometry(0.55, 0.55, 1, 8), materials.steelDark, pipeTransforms);
    g.add(pipes);
    const catwalks = instanced(new THREE.BoxGeometry(1, 0.25, 1.6), materials.steelDark, catwalkTransforms);
    g.add(catwalks);

    // Admin/gatehouse block with lit windows and a bronze deco doorway.
    const admin = box(fw * 0.1, fh * 0.22, fd * 0.18, materials.limestone);
    admin.position.set(fw * 0.36, (fh * 0.22) / 2, -fd * 0.28);
    g.add(admin);
    const adminGrid = windowGrid({ rows: 3, cols: 4, spacingX: fw * 0.02, spacingY: fh * 0.06, width: 1.6, height: 2.1, material: materials.glassNight });
    adminGrid.position.set(fw * 0.36, fh * 0.11, -fd * 0.28 + (fd * 0.18) / 2 + 0.06);
    g.add(adminGrid);
    const doorway = decoDoorway({ width: 3.4, height: 4.6 });
    doorway.position.set(fw * 0.36, 0, -fd * 0.28 + (fd * 0.18) / 2 + 0.05);
    g.add(doorway);

    // Warm underlighting near the cast sheds — molten glow reads on the
    // ground and on nearby structures after dark, beyond the stack bands.
    const moltenLight1 = new THREE.PointLight(0xff5a1e, 2.4, 95, 2);
    moltenLight1.position.set(-fw * 0.12, 3.2, fd * 0.22);
    g.add(moltenLight1);
    const moltenLight2 = new THREE.PointLight(0xff7a2e, 1.8, 75, 2);
    moltenLight2.position.set(fw * 0.18, 2.6, fd * 0.3);
    g.add(moltenLight2);
    const moltenPool = new THREE.Mesh(new THREE.CircleGeometry(fw * 0.09, 16), materials.furnaceGlow);
    moltenPool.rotation.x = -Math.PI / 2;
    moltenPool.position.set(-fw * 0.12, 0.15, fd * 0.22);
    moltenPool.userData.noShadow = true;
    moltenPool.castShadow = false;
    moltenPool.receiveShadow = false;
    g.add(moltenPool);

    // Signature sign on the shed face.
    const sign = canvasSign('SLOSS — THE IRON THAT BUILT THE SOUTH SINCE 1882', { width: fw * 0.4 });
    sign.position.set(0, shedH * 0.72, fd * 0.7 / 2 + 0.15);
    g.add(sign);

    root.add(g);

    // Soft horizon glow behind the furnaces — the low orange dome of the Bible.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256; glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(128, 118, 8, 128, 118, 120);
    grad.addColorStop(0, 'rgba(255,120,40,0.85)');
    grad.addColorStop(0.45, 'rgba(255,90,30,0.38)');
    grad.addColorStop(1, 'rgba(255,90,30,0)');
    gctx.fillStyle = grad; gctx.fillRect(0, 0, 256, 128);
    const glowMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(glowCanvas), transparent: true, opacity: 0.85,
      depthWrite: false, fog: false,
    });
    const horizonGlow = new THREE.Mesh(new THREE.PlaneGeometry(1700, 340), glowMat);
    horizonGlow.position.set(lm.position[0] - 40, 90, B.minZ + 20);
    horizonGlow.userData.noShadow = true;
    horizonGlow.castShadow = false;
    horizonGlow.receiveShadow = false;
    root.add(horizonGlow);
  }

  // =====================================================================
  // 2. SLAG GLASS WORKS — law geometry
  // =====================================================================
  {
    const lm = byId('slag-glass-works');
    const g = new THREE.Group();
    g.position.set(lm.position[0], 0, lm.position[1]);
    g.rotation.y = THREE.MathUtils.degToRad(lm.rotationYDeg || 0);
    const [fw, fd] = lm.footprint;
    const fh = lm.height;

    const shedH = fh * 0.55;
    const shed = box(fw, shedH, fd, materials.brick);
    shed.position.set(0, shedH / 2, 0);
    g.add(shed);

    // Named capBand (not a shorter bare word) so this local reads unambiguously
    // under a lexical hermetic-graph token sweep.
    const capBand = corniceBox({ width: fw + 1, depth: fd + 1, height: 0.8, material: materials.terracotta });
    capBand.position.y = shedH;
    g.add(capBand);

    const chimney = cyl(fw * 0.08, fw * 0.11, fh, 12, materials.brick);
    chimney.position.set(fw * 0.32, fh / 2, -fd * 0.2);
    g.add(chimney);

    const chimneyGlow = box(fw * 0.05, fh * 0.06, fw * 0.05, materials.furnaceGlow);
    chimneyGlow.position.set(fw * 0.32, fh + 0.2, -fd * 0.2);
    g.add(chimneyGlow);

    // Wisp of smoke off the chimney — smaller than the main stacks.
    g.add(buildSmokeColumn(fw * 0.32, fh + 1, -fd * 0.2, 4242));

    const grid = windowGrid({ rows: 2, cols: 5, spacingX: fw * 0.16, spacingY: shedH * 0.35, width: 1.8, height: 2.0, material: materials.glassNight });
    grid.position.set(-fw * 0.12, shedH * 0.55, fd / 2 + 0.06);
    g.add(grid);

    const sign = canvasSign('SLAG GLASS WORKS — AMBER WARE', { width: fw * 0.75 });
    sign.position.set(-fw * 0.12, shedH + 1.6, fd / 2 + 0.15);
    g.add(sign);

    const door = box(2.6, 3.6, 0.2, materials.bronze);
    door.position.set(fw * 0.3, 1.8, fd / 2 + 0.1);
    g.add(door);

    root.add(g);
  }

  // =====================================================================
  // 3. SLOSS POWERHOUSE & BLOWING ENGINES HALL — Bible signature, flavor
  // =====================================================================
  {
    const pos = [330, -800];
    const g = new THREE.Group();
    g.position.set(pos[0], 0, pos[1]);

    const width = 42, height = 22, depth = 22;
    const facade = pilasterFacade({ width, height, bays: 3, material: materials.limestone, pilasterMaterial: materials.terracotta });
    g.add(facade);

    const body = box(width - 2, height * 0.94, depth, materials.brick);
    body.position.set(0, (height * 0.94) / 2, -depth / 2 - 0.2);
    g.add(body);

    const grid = windowGrid({ rows: 2, cols: 6, spacingX: width / 7, spacingY: height * 0.32, width: 2.2, height: 3.4, material: materials.glassNight });
    grid.position.set(0, height * 0.55, 0.25);
    g.add(grid);

    const fin = finial({ height: 4.5 });
    fin.position.set(0, height, 0);
    g.add(fin);

    const sign = canvasSign('BLOWING ENGINES HALL', { width: 16 });
    sign.position.set(0, height + 3, 0.3);
    g.add(sign);

    root.add(g);
  }

  // =====================================================================
  // 4. FURNACEMEN'S UNION HALL No. 3 — Bible signature, flavor + readable
  // =====================================================================
  let unionPlaqueMesh;
  {
    const pos = [-40, -500];
    const hall = setbackTower({
      width: 18, depth: 18, height: 24, setbacks: 1,
      material: materials.limestone, windowMaterial: materials.glassNight,
    });
    hall.position.set(pos[0], 0, pos[1]);
    root.add(hall);

    const sign = canvasSign("FURNACEMEN'S UNION HALL No. 3", { width: 14 });
    sign.position.set(pos[0], 6.5, pos[1] + 18 / 2 + 0.15);
    root.add(sign);

    const door = box(2.6, 3.4, 0.2, materials.steelDark);
    door.position.set(pos[0], 1.7, pos[1] + 18 / 2 + 0.1);
    root.add(door);

    unionPlaqueMesh = box(1.4, 0.9, 0.08, materials.bronze);
    unionPlaqueMesh.position.set(pos[0] + 2.2, 1.6, pos[1] + 18 / 2 + 0.1);
    root.add(unionPlaqueMesh);

    registerInteractive(unionPlaqueMesh, {
      title: 'Dedication Stone — Furnacemen’s Union Hall No. 3',
      body: 'ERECTED 1926 BY THE VALLEY FEDERATION OF LABOR — IN MEMORY OF THE ACCORD OF 1921, WHEN THE MEN WHO POURED THE IRON FIRST SHARED IN WHAT IT SOLD FOR.',
    });
  }

  // =====================================================================
  // 5. NEWSPAPER STAND — readable (Ledger extra)
  // =====================================================================
  {
    const pos = [-70, -480];
    const stand = box(2.4, 1.8, 1.2, materials.steelDark);
    stand.position.set(pos[0], 0.9, pos[1]);
    root.add(stand);

    const board = canvasSign('THE BIRMINGHAM LEDGER — EXTRA! 2¢', { width: 2.6 });
    board.position.set(pos[0], 2.1, pos[1] + 0.65);
    root.add(board);

    registerInteractive(stand, {
      title: 'The Birmingham Ledger — Extra Edition, October 1928',
      body: 'EXTRA! BARONS TAKE THE SOUTHERN PENNANT — CROWDS PACK RICKWOOD FIELD! LEDGER, TWO CENTS!',
    });
  }

  // =====================================================================
  // 6. PAINTED TC IRON ADVERTISEMENT — readable, on a warehouse wall
  // =====================================================================
  {
    const pos = [200, -420];
    const wall = box(40, 16, 1, materials.brick);
    wall.position.set(pos[0], 8, pos[1]);
    root.add(wall);

    const ad = canvasSign('MADE WHERE IT’S MINED! — TC IRON, THE SOUTH’S OWN METAL', { width: 34, canvasWidth: 768, canvasHeight: 192 });
    ad.position.set(pos[0], 9, pos[1] + 0.6);
    root.add(ad);

    registerInteractive(ad, {
      title: 'Painted Wall Advertisement — Age-Herald back page, reproduced in paint',
      body: "MADE WHERE IT'S MINED! One ton of TC steel crosses our yard in ninety minutes — ore, limestone, coal, and fire. TC IRON — THE SOUTH'S OWN METAL.",
    });
  }

  // =====================================================================
  // 7. RAIL BELT along the south edge, feeding Sloss
  // =====================================================================
  {
    const railZs = [-350, -390];
    const spanMinX = B.minX + 20;
    const spanMaxX = B.maxX - 20;
    const length = spanMaxX - spanMinX;
    const midX = (spanMinX + spanMaxX) / 2;

    const rails = new THREE.Group();
    for (const rz of railZs) {
      for (const offset of [-0.72, 0.72]) {
        const rail = box(length, 0.18, 0.14, materials.rail);
        rail.position.set(midX, 0.14, rz + offset);
        rails.add(rail);
      }
    }
    root.add(rails);

    const tieTransforms = [];
    const tieSpacing = 4;
    const tieCount = Math.floor(length / tieSpacing);
    for (const rz of railZs) {
      for (let i = 0; i < tieCount; i++) {
        const x = spanMinX + i * tieSpacing;
        tieTransforms.push({ pos: [x, 0.05, rz] });
      }
    }
    const ties = instanced(new THREE.BoxGeometry(1.6, 0.1, 2.2), materials.brick, tieTransforms);
    root.add(ties);

    const boxcarTransforms = [];
    const boxcarCount = 9;
    for (let i = 0; i < boxcarCount; i++) {
      const x = spanMinX + 40 + i * ((length - 100) / boxcarCount) + (rand() - 0.5) * 6;
      boxcarTransforms.push({ pos: [x, 1.9, -390], euler: [0, rand() > 0.9 ? Math.PI : 0, 0] });
    }
    const boxcars = instanced(new THREE.BoxGeometry(11, 3.6, 3.2), materials.steelDark, boxcarTransforms);
    root.add(boxcars);
  }

  // =====================================================================
  // 8. WATER TOWER — flavor prop
  // =====================================================================
  {
    const pos = [-820, -900];
    const tank = cyl(6.2, 6.2, 7.5, 14, materials.steelDark);
    tank.position.set(pos[0], 21, pos[1]);
    root.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 3.2, 14), materials.brick);
    roof.position.set(pos[0], 21 + 7.5 / 2 + 1.6, pos[1]);
    root.add(roof);
    const legTransforms = [];
    for (const dx of [-4.4, 4.4]) {
      for (const dz of [-4.4, 4.4]) {
        legTransforms.push({ pos: [pos[0] + dx, 8.75, pos[1] + dz] });
      }
    }
    const legs = instanced(new THREE.CylinderGeometry(0.32, 0.32, 17.5, 6), materials.steelDark, legTransforms);
    root.add(legs);
  }

  // =====================================================================
  // 9. LOOSE INDUSTRIAL INFILL — coarse-grid parcels of foundries & sheds
  // =====================================================================
  {
    const exclusions = [
      { x: 150, z: -750, rx: 140, rz: 90 },   // Sloss Furnaces
      { x: -110, z: -860, rx: 50, rz: 40 },   // Slag Glass Works
      { x: 330, z: -800, rx: 45, rz: 35 },    // Powerhouse
      { x: -40, z: -500, rx: 28, rz: 28 },    // Union Hall
      { x: -70, z: -480, rx: 12, rz: 12 },    // Newspaper stand
      { x: 200, z: -420, rx: 32, rz: 20 },    // Ad wall
      { x: -820, z: -900, rx: 20, rz: 20 },   // Water tower
    ];
    const streetCorridors = [0, -480, -360, -240].map((x) => ({ x, halfW: 16 }));
    function excluded(x, z) {
      for (const e of exclusions) if (Math.abs(x - e.x) < e.rx && Math.abs(z - e.z) < e.rz) return true;
      for (const s of streetCorridors) if (Math.abs(x - s.x) < s.halfW) return true;
      return false;
    }

    const shedTransforms = [];
    const monitorTransforms = [];
    const chimneyTransforms = [];
    const glowTransforms = [];

    const xStep = 170, zStep = 200;
    for (let xi = 0, x = B.minX + 100; x < B.maxX - 60; x += xStep, xi++) {
      for (let x2 = x, row = 0; x2 < x + 1; x2 += 100000) { /* noop guard */ }
      for (let z = B.minZ + 100; z < -450; z += zStep) {
        const jx = x + (xi % 2 === 0 ? 0 : xStep / 2) + (rand() - 0.5) * 50;
        const jz = z + (rand() - 0.5) * 60;
        if (jx < B.minX + 30 || jx > B.maxX - 30) continue;
        if (excluded(jx, jz)) continue;
        if (rand() > 0.55) continue; // loose density, not solid coverage

        const w = 18 + rand() * 20;
        const d = 14 + rand() * 16;
        const h = 8 + rand() * 9;
        const rot = Math.floor(rand() * 4) * (Math.PI / 2);

        shedTransforms.push({ pos: [jx, h / 2, jz], euler: [0, rot, 0], scale: [w, h, d] });
        if (rand() > 0.45) {
          monitorTransforms.push({ pos: [jx, h + h * 0.12, jz], euler: [0, rot, 0], scale: [w * 0.5, h * 0.24, d * 0.4] });
        }
        if (rand() > 0.6) {
          chimneyTransforms.push({ pos: [jx + w * 0.3, h + 4, jz - d * 0.2], scale: [1, 1, 1] });
        }
        if (rand() > 0.3) {
          glowTransforms.push({ pos: [jx, h * 0.6, jz + d / 2 + 0.05], euler: [0, rot, 0], scale: [w * 0.5, h * 0.35, 1] });
        }
      }
    }

    const shedGeo = new THREE.BoxGeometry(1, 1, 1);
    root.add(instanced(shedGeo, materials.brick, shedTransforms));
    root.add(instanced(new THREE.BoxGeometry(1, 1, 1), materials.steelDark, monitorTransforms));
    root.add(instanced(new THREE.CylinderGeometry(0.6, 0.75, 8, 8), materials.brick, chimneyTransforms));
    root.add(instanced(new THREE.PlaneGeometry(1, 1), materials.glassNight, glowTransforms));

    // Coal piles scattered near the sheds and the rail siding.
    const coalTransforms = [];
    for (let i = 0; i < 10; i++) {
      const x = B.minX + 60 + rand() * (B.maxX - B.minX - 120);
      const z = -430 - rand() * 40;
      coalTransforms.push({ pos: [x, 1.6, z], scale: [3 + rand() * 2, 3.2 + rand() * 1.6, 3 + rand() * 2] });
    }
    root.add(instanced(new THREE.ConeGeometry(1, 1, 10), materials.steelDark, coalTransforms));
  }

  // =====================================================================
  // 10. STREETLAMPS along 20th Street North and at landmark fronts
  // =====================================================================
  {
    const lampZs = [];
    for (let z = B.minZ + 60; z < -370; z += 130) lampZs.push(z);
    lampZs.forEach((z, i) => {
      const lamp = streetlamp();
      place(lamp, i % 2 === 0 ? 12 : -12, z, i % 2 === 0 ? 0 : 180);
      root.add(lamp);
    });
    // Landmark-front lamps.
    [[130, -690], [340, -812]].forEach(([x, z]) => {
      const lamp = streetlamp();
      place(lamp, x, z, 0);
      root.add(lamp);
    });
  }
}
