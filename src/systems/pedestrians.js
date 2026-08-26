/**
 * pedestrians.js — instanced 1929 figures walking the sidewalks of
 * avenue-class streets. Each figure reads as a period pedestrian at a
 * distance: a tapered long coat, a shoulder slab, a head, a fedora or
 * cloche hat, swinging arms, and shoes peeking from the coat hem — nine
 * shared primitives, one InstancedMesh per part so draw calls stay
 * constant no matter how many people are on the sidewalk. Density,
 * routes, spawn counts, and the exported update(dt, elapsed) contract
 * are unchanged from the previous system.
 */
export function startPedestrians(ctx) {
  const { THREE, scene, plan, getDayPhase } = ctx;
  const avenues = (plan.streets || []).filter((s) => s.class === 'avenue');

  const routes = [];
  for (const st of avenues) {
    const pts = st.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    if (pts.length < 2) continue;
    let total = 0;
    const segLens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      segLens.push(l);
      total += l;
    }
    if (total <= 0) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    const centerDist = Math.hypot(mid.x, mid.z);
    const density = centerDist < 350 ? 12 : centerDist < 700 ? 6 : 2.5; // per km per side
    routes.push({ pts, segLens, total, width: st.width || 18, density });
  }

  const MAX_PEOPLE = 220;
  const people = [];
  for (const route of routes) {
    for (const side of [1, -1]) {
      const count = Math.max(1, Math.round((route.total / 1000) * route.density));
      for (let i = 0; i < count; i++) {
        people.push({
          route, side,
          dist: (route.total / count) * i + Math.random() * 8,
          speed: 1.1 + Math.random() * 0.6,
          dir: Math.random() < 0.5 ? 1 : -1,
          bob: Math.random() * Math.PI * 2,
          paletteIdx: Math.floor(Math.random() * 6),
          hatStyle: Math.random() < 0.5 ? 0 : 1, // 0 fedora (brim+crown), 1 cloche (round cap)
          hatDark: Math.random() < 0.6,
        });
      }
    }
  }
  if (people.length > MAX_PEOPLE) people.length = MAX_PEOPLE;

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
  const coatPalette = [0x3a3a3a, 0x232c3d, 0x4a1f22, 0x4b4a34, 0x6e6a5f, 0x40301f];
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
  const s = new THREE.Vector3(1, 1, 1);
  const sHidden = new THREE.Vector3(0, 0, 0);
  const sCloche = new THREE.Vector3(1.15, 1.3, 1.15);
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
        p.dist += p.speed * p.dir * dt;
        sample(p.route, p.dist);
        const heading = Math.atan2(segDir.x * p.dir, segDir.z * p.dir);
        const nx = Math.cos(heading);
        const nz = -Math.sin(heading);
        const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
        const edge = p.route.width / 2 + 2.0;
        const ox = pos.x + nx * edge * p.side;
        const oz = pos.z + nz * edge * p.side;
        const walkPhase = elapsed * 5 + p.bob;
        const bobY = 0.62 + Math.sin(walkPhase) * 0.03;
        const swing = Math.sin(walkPhase) * 0.16; // meters of arm/leg fore-aft sway

        q.setFromAxisAngle(up, heading);

        tmpPos.set(ox, bobY, oz);
        m.compose(tmpPos, q, s);
        coatMesh.setMatrixAt(i, m);

        tmpPos.set(ox, bobY + 0.56, oz);
        m.compose(tmpPos, q, s);
        shoulderMesh.setMatrixAt(i, m);

        tmpPos.set(ox, bobY + 0.74, oz);
        m.compose(tmpPos, q, s);
        headMesh.setMatrixAt(i, m);

        const hatY = bobY + 0.86;
        if (p.hatStyle === 0) {
          tmpPos.set(ox, hatY, oz);
          m.compose(tmpPos, q, s);
          brimMesh.setMatrixAt(i, m);
          tmpPos.set(ox, hatY + 0.09, oz);
          m.compose(tmpPos, q, s);
          crownMesh.setMatrixAt(i, m);
        } else {
          tmpPos.set(ox, hatY, oz);
          m.compose(tmpPos, q, sHidden);
          brimMesh.setMatrixAt(i, m);
          tmpPos.set(ox, hatY + 0.05, oz);
          m.compose(tmpPos, q, sCloche);
          crownMesh.setMatrixAt(i, m);
        }

        tmpPos.set(ox + nx * -0.28 + fwdX * swing, bobY + 0.4, oz + nz * -0.28 + fwdZ * swing);
        m.compose(tmpPos, q, s);
        armMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + nx * 0.28 - fwdX * swing, bobY + 0.4, oz + nz * 0.28 - fwdZ * swing);
        m.compose(tmpPos, q, s);
        armMesh.setMatrixAt(i * 2 + 1, m);

        tmpPos.set(ox + nx * -0.09 - fwdX * swing, 0.1, oz + nz * -0.09 - fwdZ * swing);
        m.compose(tmpPos, q, s);
        shoeMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + nx * 0.09 + fwdX * swing, 0.1, oz + nz * 0.09 + fwdZ * swing);
        m.compose(tmpPos, q, s);
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
