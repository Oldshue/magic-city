/**
 * pedestrians.js — instanced 1929 figures walking the sidewalks of
 * avenue-class streets. Each figure reads as a period pedestrian at a
 * distance: a tapered long coat, a shoulder slab, a head, a fedora or
 * cloche hat, swinging arms, and shoes peeking from the coat hem — nine
 * shared primitives, one InstancedMesh per part so draw calls stay
 * constant no matter how many people are on the sidewalk. Density,
 * routes, spawn counts, and the exported update(dt, elapsed) contract
 * are unchanged in shape from the previous system; this pass raises
 * density, adds standing conversation knots / newsboys / streetcar-stop
 * waiting knots (same instanced families, COUNT just grows), and keeps
 * walkers out of the railroad corridor except at its legal crossings.
 */
export function startPedestrians(ctx) {
  const { THREE, scene, plan, getDayPhase } = ctx;
  const walkStreets = plan.streets || [];

  // --- Railroad corridor guard: walkers must never cross the corridor band
  // z 78..318 (between x -520..520) except through 20th St, 18th St, or the
  // two viaduct decks. The plan already keeps most avenues out of the band;
  // this splits any route segment that would still cross it illegally.
  const CORRIDOR_Z0 = 78, CORRIDOR_Z1 = 318;
  const CORRIDOR_X0 = -520, CORRIDOR_X1 = 520;
  const CORRIDOR_GAPS = [[-8, 8], [232, 248], [-127, -113], [-247, -233]];
  function segCrossesCorridorIllegally(a, b) {
    const zMin = Math.min(a[1], b[1]), zMax = Math.max(a[1], b[1]);
    if (zMax <= CORRIDOR_Z0 || zMin >= CORRIDOR_Z1) return false;
    const xMin = Math.min(a[0], b[0]), xMax = Math.max(a[0], b[0]);
    if (xMax <= CORRIDOR_X0 || xMin >= CORRIDOR_X1) return false;
    for (const [gx0, gx1] of CORRIDOR_GAPS) {
      if (xMin >= gx0 && xMax <= gx1) return false;
    }
    return true;
  }

  const routes = [];
  for (const st of walkStreets) {
    const rawPts = st.path;
    if (!rawPts || rawPts.length < 2) continue;
    // Split into runs, breaking wherever a segment would cross the corridor
    // outside the legal gaps.
    let run = [rawPts[0]];
    const runs = [];
    for (let i = 0; i < rawPts.length - 1; i++) {
      const a = rawPts[i], b = rawPts[i + 1];
      if (segCrossesCorridorIllegally(a, b)) {
        if (run.length >= 2) runs.push(run);
        run = [b];
      } else {
        run.push(b);
      }
    }
    if (run.length >= 2) runs.push(run);

    for (const r of runs) {
      const pts = r.map(([x, z]) => new THREE.Vector3(x, 0, z));
      let total = 0;
      const segLens = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const l = pts[i].distanceTo(pts[i + 1]);
        segLens.push(l);
        total += l;
      }
      if (total <= 0) continue;
      // True geometric midpoint (by distance along the run), so density
      // reads correctly against the Heaviest Corner at the origin.
      let dHalf = total / 2, mi = 0;
      while (mi < segLens.length - 1 && dHalf > segLens[mi]) { dHalf -= segLens[mi]; mi++; }
      const midSegLen = segLens[mi] || 1;
      const midT = midSegLen > 0 ? dHalf / midSegLen : 0;
      const midX = pts[mi].x + (pts[mi + 1].x - pts[mi].x) * midT;
      const midZ = pts[mi].z + (pts[mi + 1].z - pts[mi].z) * midT;
      const centerDist = Math.hypot(midX, midZ);
      const density = centerDist < 350 ? 40 : centerDist < 700 ? 16 : 5; // per km per side
      routes.push({ pts, segLens, total, width: st.width || 18, density });
    }
  }

  // --- Tier 1: density with a hard walker cap -----------------------------
  const WALK_CAP = 900;
  const routeSideCounts = routes.map((route) =>
    Math.max(1, Math.round((route.total / 1000) * route.density))
  );
  const routeSum = routeSideCounts.reduce((a, b) => a + b, 0) * 2; // two sides per route
  const capScale = routeSum > WALK_CAP ? WALK_CAP / routeSum : 1;

  // Small seeded LCG so per-walker variety (speed, scale, palette) is
  // deterministic across runs without extra stored state.
  let seed = 20200;
  function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  const people = [];
  routes.forEach((route, ri) => {
    const perSide = Math.max(1, Math.round(routeSideCounts[ri] * capScale));
    for (const side of [1, -1]) {
      for (let i = 0; i < perSide; i++) {
        const roll = rand();
        let scale = 1.0;
        if (roll < 0.02) scale = 0.6; // child, paired near the previous walker below
        else if (roll < 0.12) scale = 0.82; // shorter silhouette (~12% overall)
        const baseDist = (route.total / perSide) * i + rand() * 8;
        const prev = people[people.length - 1];
        const dist = scale === 0.6 && prev && prev.route === route && prev.side === side
          ? prev.dist + (rand() < 0.5 ? 1 : -1) * 1.1
          : baseDist;
        const baseSpeed = 1.1 + rand() * 0.6;
        const speedVar = 0.75 + rand() * 0.5; // +/-25% seeded variation, stored alongside speed
        people.push({
          route, side,
          dist,
          speed: baseSpeed * speedVar,
          speedVar,
          dir: rand() < 0.5 ? 1 : -1,
          bob: rand() * Math.PI * 2,
          paletteIdx: Math.floor(rand() * 8),
          hatStyle: rand() < 0.5 ? 0 : 1, // 0 fedora (brim+crown), 1 cloche (round cap)
          hatDark: rand() < 0.6,
          scale,
          standing: false,
          prop: false,
          x: 0, z: 0,
          facing: 0,
        });
      }
    }
  });

  // --- Tier 2: purposeful standing clusters -------------------------------
  function distToRoute(x, z, route) {
    let best = Infinity;
    for (let i = 0; i < route.pts.length - 1; i++) {
      const a = route.pts[i], b = route.pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
      if (d < best) best = d;
    }
    return best;
  }
  function nearAnyRoute(x, z, maxDist) {
    for (const route of routes) {
      if (distToRoute(x, z, route) <= maxDist) return true;
    }
    return false;
  }
  function addStandingFigure(x, z, facing, scale) {
    people.push({
      route: null, side: 1, dist: 0, speed: 0, speedVar: 1, dir: 1,
      bob: rand() * Math.PI * 2,
      paletteIdx: Math.floor(rand() * 8),
      hatStyle: rand() < 0.5 ? 0 : 1,
      hatDark: rand() < 0.6,
      scale, standing: true, prop: false,
      x, z, facing,
    });
  }
  function addStandingCluster(cx, cz, count, radius) {
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2 + rand() * 0.5;
      const x = cx + Math.cos(theta) * radius;
      const z = cz + Math.sin(theta) * radius;
      const facing = Math.atan2(cx - x, cz - z); // face inward, toward the knot's center
      const scale = rand() < 0.25 ? 0.82 : 1.0;
      addStandingFigure(x, z, facing, scale);
    }
  }

  // Corner conversation knots — loose circles of 3-5 standing figures.
  const CORNER_CLUSTERS = [[0, 0], [-120, 0], [120, 0], [0, -140], [-120, -140], [240, 0]];
  for (const [cx, cz] of CORNER_CLUSTERS) {
    if (!nearAnyRoute(cx, cz, 60)) continue; // skip corners outside routes' reach
    const n = 3 + Math.floor(rand() * 3); // 3-5
    addStandingCluster(cx, cz, n, 0.9 + rand() * 0.4);
  }

  // Newsboys with a tiny paper stack beside them. The stack reuses the
  // shoulder-box instanced part at a small scale (one small box, merged into
  // the existing family) — every other part of that instance slot is scaled
  // to zero and stowed below grade, matching the file's existing hide idiom.
  function addNewsboy(nx, nz) {
    addStandingFigure(nx, nz, rand() * Math.PI * 2, 0.55);
    people.push({
      route: null, side: 1, dist: 0, speed: 0, speedVar: 1, dir: 1,
      bob: 0, paletteIdx: 5, hatStyle: 0, hatDark: true,
      scale: 0.55, standing: true, prop: true,
      x: nx + 0.5, z: nz + 0.35, facing: 0,
    });
  }
  addNewsboy(12, -8);
  addNewsboy(-108, 6);

  // Waiting knots at the 4 nearest downtown streetcar stops (coordinates
  // read from streetcars.js's own line paths: the Red Line's downtown leg
  // and the shared Avondale Local / Bessemer Limited terminus point).
  const DOWNTOWN_STOPS = [[0, -100], [0, 140], [-60, -140], [0, 200]];
  for (const [sx, sz] of DOWNTOWN_STOPS) {
    const n = 2 + Math.floor(rand() * 3); // 2-4
    addStandingCluster(sx + 2.5, sz + 2.5, n, 0.7 + rand() * 0.3);
  }

  const COUNT = Math.max(1, people.length);

  // --- geometry: a handful of shared primitives, ~9 per figure -----------
  const coatGeo = new THREE.CylinderGeometry(0.17, 0.24, 1.0, 8);
  const shoulderGeo = new THREE.BoxGeometry(0.46, 0.16, 0.26);
  const headGeo = new THREE.SphereGeometry(0.105, 8, 6);
  const brimGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.03, 10);
  const crownGeo = new THREE.CylinderGeometry(0.095, 0.115, 0.17, 8);
  const armGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.6, 6);
  const shoeGeo = new THREE.BoxGeometry(0.1, 0.2, 0.17);

  // --- materials: muted period coat tones + trim, palette-consistent -----
  // + charcoal (0x2e2e2e) and dust brown (0x7a6248) for Tier 1 variety.
  const coatPalette = [0x3a3a3a, 0x232c3d, 0x4a1f22, 0x4b4a34, 0x6e6a5f, 0x40301f, 0x2e2e2e, 0x7a6248];
  const hatPalette = [0x141414, 0x2c2018];
  const coatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.02, vertexColors: true });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.8, metalness: 0.0 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.02, vertexColors: true });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x171310, roughness: 0.7, metalness: 0.05 });

  const coatMesh = new THREE.InstancedMesh(coatGeo, coatMat, COUNT);
  const shoulderMesh = new THREE.InstancedMesh(shoulderGeo, coatMat, COUNT);
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, COUNT);
  const brimMesh = new THREE.InstancedMesh(brimGeo, hatMat, COUNT);
  const crownMesh = new THREE.InstancedMesh(crownGeo, hatMat, COUNT);
  const armMesh = new THREE.InstancedMesh(armGeo, coatMat, COUNT * 2);
  const shoeMesh = new THREE.InstancedMesh(shoeGeo, shoeMat, COUNT * 2);

  for (let i = 0; i < COUNT; i++) {
    const p = people[i];
    const cc = new THREE.Color(coatPalette[p ? p.paletteIdx : 0]);
    coatMesh.setColorAt(i, cc);
    shoulderMesh.setColorAt(i, cc);
    armMesh.setColorAt(i * 2, cc);
    armMesh.setColorAt(i * 2 + 1, cc);
    const hc = new THREE.Color(hatPalette[p && p.hatDark ? 0 : 1]);
    brimMesh.setColorAt(i, hc);
    crownMesh.setColorAt(i, hc);
  }
  if (coatMesh.instanceColor) coatMesh.instanceColor.needsUpdate = true;
  if (shoulderMesh.instanceColor) shoulderMesh.instanceColor.needsUpdate = true;
  if (armMesh.instanceColor) armMesh.instanceColor.needsUpdate = true;
  if (brimMesh.instanceColor) brimMesh.instanceColor.needsUpdate = true;
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;

  scene.add(coatMesh, shoulderMesh, headMesh, brimMesh, crownMesh, armMesh, shoeMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sHidden = new THREE.Vector3(0, 0, 0);
  const sCloche = new THREE.Vector3(1.15, 1.3, 1.15);
  const sBody = new THREE.Vector3(1, 1, 1);
  const sHat = new THREE.Vector3(1, 1, 1);
  const sProp = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const segDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function sample(route, dist) {
    let d = ((dist % route.total) + route.total) % route.total;
    let i = 0;
    while (i < route.segLens.length && d > route.segLens[i]) {
      d -= route.segLens[i];
      i++;
    }
    i = Math.min(i, route.segLens.length - 1);
    const a = route.pts[i];
    const b = route.pts[i + 1];
    const segLen = route.segLens[i] || 1;
    const t = segLen > 0 ? d / segLen : 0;
    pos.lerpVectors(a, b, t);
    segDir.subVectors(b, a).normalize();
  }

  // getDayPhase reserved for future day/night pedestrian density tuning.
  void getDayPhase;

  return {
    update(dt, elapsed) {
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        let ox, oz, heading;
        if (p.standing) {
          ox = p.x;
          oz = p.z;
          heading = p.facing;
        } else {
          p.dist += p.speed * p.dir * dt;
          sample(p.route, p.dist);
          heading = Math.atan2(segDir.x * p.dir, segDir.z * p.dir);
          const nx0 = Math.cos(heading);
          const nz0 = -Math.sin(heading);
          const edge = p.route.width / 2 + 2.0;
          ox = pos.x + nx0 * edge * p.side;
          oz = pos.z + nz0 * edge * p.side;
        }
        const nx = Math.cos(heading);
        const nz = -Math.sin(heading);
        const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
        const walkPhase = elapsed * (p.standing ? 1.2 : 5) + p.bob;
        const idleAmp = p.standing ? 0.01 : 0.03;
        const bobY = 0.62 * p.scale + Math.sin(walkPhase) * idleAmp;
        const swing = p.standing ? 0 : Math.sin(walkPhase) * 0.16 * p.scale; // meters of arm/leg fore-aft sway

        q.setFromAxisAngle(up, heading);
        sBody.set(p.scale, p.scale, p.scale);

        if (p.prop) {
          // Paper stack: only the shoulder-box part draws (a small box, still
          // inside the existing shoulder InstancedMesh family); every other
          // part for this slot is scaled to zero and stowed below grade.
          tmpPos.set(ox, 0.14, oz);
          sProp.set(0.5, 0.35, 0.6);
          m.compose(tmpPos, q, sProp);
          shoulderMesh.setMatrixAt(i, m);
          tmpPos.set(ox, -5, oz);
          m.compose(tmpPos, q, sHidden);
          coatMesh.setMatrixAt(i, m);
          headMesh.setMatrixAt(i, m);
          brimMesh.setMatrixAt(i, m);
          crownMesh.setMatrixAt(i, m);
          armMesh.setMatrixAt(i * 2, m);
          armMesh.setMatrixAt(i * 2 + 1, m);
          shoeMesh.setMatrixAt(i * 2, m);
          shoeMesh.setMatrixAt(i * 2 + 1, m);
          continue;
        }

        tmpPos.set(ox, bobY, oz);
        m.compose(tmpPos, q, sBody);
        coatMesh.setMatrixAt(i, m);

        tmpPos.set(ox, bobY + 0.56 * p.scale, oz);
        m.compose(tmpPos, q, sBody);
        shoulderMesh.setMatrixAt(i, m);

        tmpPos.set(ox, bobY + 0.74 * p.scale, oz);
        m.compose(tmpPos, q, sBody);
        headMesh.setMatrixAt(i, m);

        const hatY = bobY + 0.86 * p.scale;
        if (p.hatStyle === 0) {
          tmpPos.set(ox, hatY, oz);
          m.compose(tmpPos, q, sBody);
          brimMesh.setMatrixAt(i, m);
          tmpPos.set(ox, hatY + 0.09 * p.scale, oz);
          m.compose(tmpPos, q, sBody);
          crownMesh.setMatrixAt(i, m);
        } else {
          tmpPos.set(ox, hatY, oz);
          m.compose(tmpPos, q, sHidden);
          brimMesh.setMatrixAt(i, m);
          sHat.set(sCloche.x * p.scale, sCloche.y * p.scale, sCloche.z * p.scale);
          tmpPos.set(ox, hatY + 0.05 * p.scale, oz);
          m.compose(tmpPos, q, sHat);
          crownMesh.setMatrixAt(i, m);
        }

        tmpPos.set(ox + nx * -0.28 * p.scale + fwdX * swing, bobY + 0.4 * p.scale, oz + nz * -0.28 * p.scale + fwdZ * swing);
        m.compose(tmpPos, q, sBody);
        armMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + nx * 0.28 * p.scale - fwdX * swing, bobY + 0.4 * p.scale, oz + nz * 0.28 * p.scale - fwdZ * swing);
        m.compose(tmpPos, q, sBody);
        armMesh.setMatrixAt(i * 2 + 1, m);

        tmpPos.set(ox + nx * -0.09 * p.scale - fwdX * swing, 0.1 * p.scale, oz + nz * -0.09 * p.scale - fwdZ * swing);
        m.compose(tmpPos, q, sBody);
        shoeMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + nx * 0.09 * p.scale + fwdX * swing, 0.1 * p.scale, oz + nz * 0.09 * p.scale + fwdZ * swing);
        m.compose(tmpPos, q, sBody);
        shoeMesh.setMatrixAt(i * 2 + 1, m);
      }
      const n = people.length;
      coatMesh.count = n; shoulderMesh.count = n; headMesh.count = n;
      brimMesh.count = n; crownMesh.count = n;
      armMesh.count = n * 2; shoeMesh.count = n * 2;
      coatMesh.instanceMatrix.needsUpdate = true;
      shoulderMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      brimMesh.instanceMatrix.needsUpdate = true;
      crownMesh.instanceMatrix.needsUpdate = true;
      armMesh.instanceMatrix.needsUpdate = true;
      shoeMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
