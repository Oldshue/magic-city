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

  // --- geometry: a few boxes/cylinders, each shared across the whole fleet ---
  const bodyGeo = new THREE.BoxGeometry(1.9, 1.05, 4.3);
  const hoodGeo = new THREE.BoxGeometry(1.6, 0.68, 1.5);
  const cabinGeo = new THREE.BoxGeometry(1.56, 0.72, 2.3);
  const roofGeo = new THREE.BoxGeometry(1.28, 0.16, 2.0);
  const boardGeo = new THREE.BoxGeometry(0.22, 0.08, 3.1);
  const radiatorGeo = new THREE.BoxGeometry(1.3, 0.6, 0.14);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 6);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.3, 6);
  const lampGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const glowGeo = new THREE.PlaneGeometry(1.6, 2.4);

  // --- materials: three period lacquers + trim, palette-consistent ---
  const lacquer = [0x1d3b28, 0x141414, 0x4a1620]; // deep green / black / burgundy
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.4, vertexColors: true });
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.42, vertexColors: true });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.6, metalness: 0.15 });
  const roofMat = cabinMat;
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.7, metalness: 0.3 });
  const radiatorMat = new THREE.MeshStandardMaterial({ color: 0xd7dadd, roughness: 0.18, metalness: 0.88 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9, metalness: 0.05 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.35, metalness: 0.45 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 0, roughness: 0.35, metalness: 0.1 });

  const glowTex = makeGlowTexture(THREE);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xffcf8a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, COUNT);
  const hoodMesh = new THREE.InstancedMesh(hoodGeo, hoodMat, COUNT);
  const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, COUNT);
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, COUNT);
  const boardMesh = new THREE.InstancedMesh(boardGeo, boardMat, COUNT * 2);
  const radiatorMesh = new THREE.InstancedMesh(radiatorGeo, radiatorMat, COUNT);
  const wheelMesh = new THREE.InstancedMesh(wheelGeo, tireMat, COUNT * 4);
  const hubMesh = new THREE.InstancedMesh(hubGeo, hubMat, COUNT * 4);
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, COUNT * 2);
  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, COUNT);
  glowMesh.frustumCulled = false;

  for (let i = 0; i < COUNT; i++) {
    const c = new THREE.Color(lacquer[i % lacquer.length]);
    bodyMesh.setColorAt(i, c);
    hoodMesh.setColorAt(i, c);
  }
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  if (hoodMesh.instanceColor) hoodMesh.instanceColor.needsUpdate = true;

  scene.add(bodyMesh, hoodMesh, cabinMesh, roofMesh, boardMesh, radiatorMesh, wheelMesh, hubMesh, lampMesh, glowMesh);

  // --- scratch objects, allocated once (zero allocation inside update) ---
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qWheel = new THREE.Quaternion();
  const qGlow = new THREE.Quaternion();
  const wheelTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  const glowTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const s = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const segDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // wheel local offsets: [lateral, forward]
  const WHEEL_OFFSETS = [
    [-0.92, 1.32], [0.92, 1.32], [-0.92, -1.32], [0.92, -1.32],
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

        tmpPos.set(ox, 0.56, oz);
        m.compose(tmpPos, q, s);
        bodyMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * 1.85, 0.82, oz + fwdZ * 1.85);
        m.compose(tmpPos, q, s);
        hoodMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * -0.55, 1.24, oz + fwdZ * -0.55);
        m.compose(tmpPos, q, s);
        cabinMesh.setMatrixAt(i, m);

        tmpPos.set(ox + fwdX * -0.55, 1.68, oz + fwdZ * -0.55);
        m.compose(tmpPos, q, s);
        roofMesh.setMatrixAt(i, m);

        tmpPos.set(ox + latX * -1.02, 0.38, oz + latZ * -1.02);
        m.compose(tmpPos, q, s);
        boardMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + latX * 1.02, 0.38, oz + latZ * 1.02);
        m.compose(tmpPos, q, s);
        boardMesh.setMatrixAt(i * 2 + 1, m);

        tmpPos.set(ox + fwdX * 2.1, 0.82, oz + fwdZ * 2.1);
        m.compose(tmpPos, q, s);
        radiatorMesh.setMatrixAt(i, m);

        for (let w = 0; w < 4; w++) {
          const wl = WHEEL_OFFSETS[w][0], wf = WHEEL_OFFSETS[w][1];
          tmpPos.set(ox + latX * wl + fwdX * wf, 0.34, oz + latZ * wl + fwdZ * wf);
          qWheel.copy(q).multiply(wheelTilt);
          m.compose(tmpPos, qWheel, s);
          wheelMesh.setMatrixAt(i * 4 + w, m);
          hubMesh.setMatrixAt(i * 4 + w, m);
        }

        tmpPos.set(ox + latX * -0.6 + fwdX * 2.18, 0.58, oz + latZ * -0.6 + fwdZ * 2.18);
        m.compose(tmpPos, q, s);
        lampMesh.setMatrixAt(i * 2, m);
        tmpPos.set(ox + latX * 0.6 + fwdX * 2.18, 0.58, oz + latZ * 0.6 + fwdZ * 2.18);
        m.compose(tmpPos, q, s);
        lampMesh.setMatrixAt(i * 2 + 1, m);

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
