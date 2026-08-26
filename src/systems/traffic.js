/**
 * traffic.js — instanced period automobiles driving avenue-class streets.
 * 1929 sedan silhouette built from a handful of shared box/cylinder parts:
 * chassis, distinct front hood, cabin with a slight roof crown, running
 * boards, four dark wheels with pale hubs, a chrome-ish radiator face, and
 * small round headlamps. Body + hood carry one of three period lacquer
 * colors (deep green / black / burgundy). At night the headlamp lenses go
 * warm-emissive and a soft transparent gradient quad lights the road ahead
 * of each car — no real lights, no movement-logic changes. Every part is a
 * shared InstancedMesh: draw call count is constant regardless of car count.
 */
export function startTraffic(ctx) {
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
    routes.push({ pts, segLens, total, width: st.width || 18 });
  }

  const CARS_PER_LANE_KM = 5;
  const MAX_INSTANCES = 140;
  const instances = [];
  for (const route of routes) {
    const laneOffset = Math.max(2.2, route.width * 0.22);
    for (const dir of [1, -1]) {
      const count = Math.max(1, Math.round((route.total / 1000) * CARS_PER_LANE_KM));
      for (let i = 0; i < count; i++) {
        instances.push({
          route, dir, laneOffset,
          dist: (route.total / count) * i + Math.random() * 20,
          speed: 6.5 + Math.random() * 2.5,
        });
      }
    }
  }
  if (instances.length > MAX_INSTANCES) instances.length = MAX_INSTANCES;

  const COUNT = Math.max(1, instances.length);

  // --- geometry: a 1929 sedan from shared primitives, judged at 3 m ---
  const bodyGeo = new THREE.BoxGeometry(1.44, 0.52, 3.05);
  const hoodGeo = new THREE.BoxGeometry(1.02, 0.46, 1.32);
  const cowlGeo = new THREE.BoxGeometry(1.3, 0.34, 0.5);
  const cabinGeo = new THREE.BoxGeometry(1.46, 0.8, 1.72);
  const roofGeo = new THREE.BoxGeometry(1.54, 0.09, 1.9);
  const visorGeo = new THREE.BoxGeometry(1.5, 0.05, 0.3);
  const boardGeo = new THREE.BoxGeometry(0.28, 0.07, 1.5);
  const radiatorGeo = new THREE.BoxGeometry(0.9, 0.62, 0.16);
  const fenderGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.3, 10, 1, true, Math.PI, Math.PI);
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.22, 12);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.23, 8);
  const lampGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10);
  const barGeo = new THREE.BoxGeometry(1.12, 0.05, 0.05);
  const bumperGeo = new THREE.BoxGeometry(1.3, 0.07, 0.06);
  const spareGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.11, 12);
  const glowGeo = new THREE.PlaneGeometry(1.6, 2.4);

  // --- materials: three period lacquers + trim, palette-consistent ---
  const lacquer = [0x2e5c3e, 0x23252a, 0x6b2230];
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.35, vertexColors: true });
  const hoodMat = bodyMat;
  const cabinMat = bodyMat;
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.7, metalness: 0.1 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.65, metalness: 0.25 });
  const fenderMat = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.45, metalness: 0.3 });
  const radiatorMat = new THREE.MeshStandardMaterial({ color: 0xd7dadd, roughness: 0.18, metalness: 0.88 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.92, metalness: 0.02 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.3, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, emissive: 0xfff2c8, emissiveIntensity: 0, roughness: 0.3, metalness: 0.7 });

  const glowTex = makeGlowTexture(THREE);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xffcf8a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, COUNT);
  const hoodMesh = new THREE.InstancedMesh(hoodGeo, hoodMat, COUNT);
  const cowlMesh = new THREE.InstancedMesh(cowlGeo, bodyMat, COUNT);
  const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, COUNT);
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, COUNT);
  const visorMesh = new THREE.InstancedMesh(visorGeo, roofMat, COUNT);
  const boardMesh = new THREE.InstancedMesh(boardGeo, boardMat, COUNT * 2);
  const radiatorMesh = new THREE.InstancedMesh(radiatorGeo, radiatorMat, COUNT);
  const fenderMesh = new THREE.InstancedMesh(fenderGeo, fenderMat, COUNT * 4);
  const wheelMesh = new THREE.InstancedMesh(wheelGeo, tireMat, COUNT * 4);
  const hubMesh = new THREE.InstancedMesh(hubGeo, hubMat, COUNT * 4);
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, COUNT * 2);
  const barMesh = new THREE.InstancedMesh(barGeo, boardMat, COUNT);
  const bumperMesh = new THREE.InstancedMesh(bumperGeo, radiatorMat, COUNT * 2);
  const spareMesh = new THREE.InstancedMesh(spareGeo, tireMat, COUNT);
  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, COUNT);
  glowMesh.frustumCulled = false;

  for (let i = 0; i < COUNT; i++) {
    const c = new THREE.Color(lacquer[i % lacquer.length]);
    bodyMesh.setColorAt(i, c);
    hoodMesh.setColorAt(i, c);
    cowlMesh.setColorAt(i, c);
    cabinMesh.setColorAt(i, c);
  }
  for (const im of [bodyMesh, hoodMesh, cowlMesh, cabinMesh]) {
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  scene.add(bodyMesh, hoodMesh, cowlMesh, cabinMesh, roofMesh, visorMesh, boardMesh, radiatorMesh, fenderMesh, wheelMesh, hubMesh, lampMesh, barMesh, bumperMesh, spareMesh, glowMesh);

  // --- scratch objects, allocated once (zero allocation inside update) ---
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qWheel = new THREE.Quaternion();
  const qGlow = new THREE.Quaternion();
  const wheelTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  const spareTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const qSpare = new THREE.Quaternion();
  const glowTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const s = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const segDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // wheel local offsets: [lateral, forward]
  const WHEEL_OFFSETS = [
    [-0.78, 1.35], [0.78, 1.35], [-0.78, -1.3], [0.78, -1.3],
  ];

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

  return {
    update(dt) {
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;
      for (let i = 0; i < instances.length; i++) {
        const car = instances[i];
        car.dist += car.speed * car.dir * dt;
        sample(car.route, car.dist);
        const heading = Math.atan2(segDir.x * car.dir, segDir.z * car.dir);
        const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
        const latX = Math.cos(heading), latZ = -Math.sin(heading);
        const ox = pos.x + latX * car.laneOffset * car.dir;
        const oz = pos.z + latZ * car.laneOffset * car.dir;

        q.setFromAxisAngle(up, heading);

        tmpPos.set(ox, 0.62, oz);
        m.compose(tmpPos, q, s);
        bodyMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * 1.18, 0.85, oz + fwdZ * 1.18);
        m.compose(tmpPos, q, s);
        hoodMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * 0.42, 0.98, oz + fwdZ * 0.42);
        m.compose(tmpPos, q, s);
        cowlMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * -0.55, 1.06, oz + fwdZ * -0.55);
        m.compose(tmpPos, q, s);
        cabinMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * -0.55, 1.5, oz + fwdZ * -0.55);
        m.compose(tmpPos, q, s);
        roofMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * 0.42, 1.36, oz + fwdZ * 0.42);
        m.compose(tmpPos, q, s);
        visorMesh.setMatrixAt(i, m);

        tmpPos.set(ox + latX * -0.86, 0.4, oz + latZ * -0.86);
        m.compose(tmpPos, q, s);
        boardMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + latX * 0.86, 0.4, oz + latZ * 0.86);
        m.compose(tmpPos, q, s);
        boardMesh.setMatrixAt(i * 2 + 1, m);

        tmpPos.set(ox + fwdX * 1.86, 0.82, oz + fwdZ * 1.86);
        m.compose(tmpPos, q, s);
        radiatorMesh.setMatrixAt(i, m);

        for (let w = 0; w < 4; w++) {
          const wl = WHEEL_OFFSETS[w][0], wf = WHEEL_OFFSETS[w][1];
          tmpPos.set(ox + latX * wl + fwdX * wf, 0.37, oz + latZ * wl + fwdZ * wf);
          qWheel.copy(q).multiply(wheelTilt);
          m.compose(tmpPos, qWheel, s);
          wheelMesh.setMatrixAt(i * 4 + w, m);
          hubMesh.setMatrixAt(i * 4 + w, m);
          tmpPos.set(ox + latX * wl + fwdX * wf, 0.42, oz + latZ * wl + fwdZ * wf);
          m.compose(tmpPos, qWheel, s);
          fenderMesh.setMatrixAt(i * 4 + w, m);
        }

        qSpare.copy(q).multiply(spareTilt);
        tmpPos.set(ox + latX * -0.42 + fwdX * 1.98, 1.0, oz + latZ * -0.42 + fwdZ * 1.98);
        m.compose(tmpPos, qSpare, s);
        lampMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + latX * 0.42 + fwdX * 1.98, 1.0, oz + latZ * 0.42 + fwdZ * 1.98);
        m.compose(tmpPos, qSpare, s);
        lampMesh.setMatrixAt(i * 2 + 1, m);

        tmpPos.set(ox + fwdX * 1.98, 1.0, oz + fwdZ * 1.98);
        m.compose(tmpPos, q, s);
        barMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * 2.02, 0.46, oz + fwdZ * 2.02);
        m.compose(tmpPos, q, s);
        bumperMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + fwdX * -1.72, 0.46, oz + fwdZ * -1.72);
        m.compose(tmpPos, q, s);
        bumperMesh.setMatrixAt(i * 2 + 1, m);

        qSpare.copy(q).multiply(spareTilt);
        tmpPos.set(ox + fwdX * -1.68, 0.78, oz + fwdZ * -1.68);
        m.compose(tmpPos, qSpare, s);
        spareMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * 4.4, 0.04, oz + fwdZ * 4.4);
        qGlow.copy(q).multiply(glowTilt);
        m.compose(tmpPos, qGlow, s);
        glowMesh.setMatrixAt(i, m);
      }

      const n = instances.length;
      bodyMesh.count = n; hoodMesh.count = n; cabinMesh.count = n; roofMesh.count = n;
      boardMesh.count = n * 2; radiatorMesh.count = n;
      wheelMesh.count = n * 4; hubMesh.count = n * 4;
      lampMesh.count = n * 2; glowMesh.count = n;
      bodyMesh.instanceMatrix.needsUpdate = true;
      hoodMesh.instanceMatrix.needsUpdate = true;
      cabinMesh.instanceMatrix.needsUpdate = true;
      roofMesh.instanceMatrix.needsUpdate = true;
      boardMesh.instanceMatrix.needsUpdate = true;
      radiatorMesh.instanceMatrix.needsUpdate = true;
      wheelMesh.instanceMatrix.needsUpdate = true;
      hubMesh.instanceMatrix.needsUpdate = true;
      lampMesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
      cowlMesh.instanceMatrix.needsUpdate = true;
      visorMesh.instanceMatrix.needsUpdate = true;
      fenderMesh.instanceMatrix.needsUpdate = true;
      barMesh.instanceMatrix.needsUpdate = true;
      bumperMesh.instanceMatrix.needsUpdate = true;
      spareMesh.instanceMatrix.needsUpdate = true;

      lampMat.emissiveIntensity = night ? 1.8 : 0.0;
      glowMat.opacity = night ? 0.4 : 0.0;
    },
  };
}

/** Small radial gradient texture for the headlight ground-glow quad. */
function makeGlowTexture(THREE) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const c2d = canvas.getContext('2d');
  const grad = c2d.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,220,160,0.9)');
  grad.addColorStop(0.5, 'rgba(255,200,130,0.35)');
  grad.addColorStop(1, 'rgba(255,200,130,0)');
  c2d.fillStyle = grad;
  c2d.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
