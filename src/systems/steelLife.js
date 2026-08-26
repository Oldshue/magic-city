/**
 * steelLife.js — the steel district's furnace life: pulsing emissive glow,
 * sparse rising smoke and embers near every landmark of kind "furnace",
 * strongest at night. Also rolls a slow freight silhouette along a rail
 * approach if (and only if) city-plan.json actually defines one — the
 * current plan does not, so this gracefully skips the train and logs why.
 */
export function startSteelLife(ctx) {
  const { THREE, scene, plan, materials, getDayPhase } = ctx;
  const furnaces = (plan.landmarks || []).filter((l) => l.kind === 'furnace');

  // --- pulsing furnace glow (cheap: two crossed unlit planes per furnace) --
  const glowSprites = [];
  for (const f of furnaces) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5a1e, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    const w = Math.max(8, f.footprint[0] * 0.7);
    const h = Math.max(8, f.height * 0.5);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(f.position[0], f.height * 0.28, f.position[1]);
    scene.add(plane);
    const mat2 = mat.clone();
    const plane2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat2);
    plane2.position.copy(plane.position);
    plane2.rotation.y = Math.PI / 2;
    scene.add(plane2);
    glowSprites.push({ mat, mat2, seed: Math.random() * 100 });
  }

  // --- shared instanced smoke + embers across all furnaces -----------------
  const PER_FURNACE = 14;
  const total = Math.max(1, furnaces.length * PER_FURNACE);
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x4a463f, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide,
  });
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, total);
  scene.add(smoke);

  const emberGeo = new THREE.SphereGeometry(0.12, 4, 4);
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff9c3e, transparent: true, opacity: 0.8 });
  const embers = new THREE.InstancedMesh(emberGeo, emberMat, total);
  scene.add(embers);

  const particles = [];
  for (const f of furnaces) {
    for (let i = 0; i < PER_FURNACE; i++) {
      particles.push({
        origin: f,
        offsetX: (Math.random() - 0.5) * f.footprint[0] * 0.6,
        offsetZ: (Math.random() - 0.5) * f.footprint[1] * 0.6,
        h: Math.random() * f.height,
        speed: 3 + Math.random() * 3,
        scale: 2 + Math.random() * 3,
        drift: (Math.random() - 0.5) * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  if (particles.length === 0) {
    smoke.count = 0;
    embers.count = 0;
  }

  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const camQuat = new THREE.Quaternion();

  // --- optional freight rail approach --------------------------------------
  const railStreet = (plan.streets || []).find((st) => st.class === 'rail');
  let train = null;
  const trainDir = new THREE.Vector3();
  if (railStreet && Array.isArray(railStreet.path) && railStreet.path.length >= 2) {
    const pts = railStreet.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const group = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.2, 8.5), materials.steelDark);
      car.position.set(0, 1.6, -i * 9.2);
      group.add(car);
    }
    scene.add(group);
    train = { group, pts, dist: 0, total: 0, segLens: [] };
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      train.segLens.push(l);
      train.total += l;
    }
  } else {
    console.info('[magic-city] steelLife: city-plan.json has no rail-class street — freight train skipped gracefully.');
  }

  return {
    update(dt, elapsed, camera) {
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;
      const nightBoost = 0.4 + night * 0.6;

      for (let i = 0; i < glowSprites.length; i++) {
        const gs = glowSprites[i];
        const flicker = 0.55 + Math.sin(elapsed * 6 + gs.seed) * 0.12 + Math.sin(elapsed * 17 + gs.seed) * 0.06;
        const op = Math.max(0.08, flicker) * nightBoost;
        gs.mat.opacity = op;
        gs.mat2.opacity = op;
      }

      if (camera) camQuat.copy(camera.quaternion);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.h += p.speed * dt;
        if (p.h > p.origin.height * 1.4) p.h = 0;
        const rise = p.h / (p.origin.height * 1.4);
        const x = p.origin.position[0] + p.offsetX + Math.sin(elapsed * 0.5 + p.phase) * p.drift * rise * 4;
        const z = p.origin.position[1] + p.offsetZ + Math.cos(elapsed * 0.4 + p.phase) * p.drift * rise * 4;
        const y = p.origin.height * 0.5 + p.h;

        const smokeScale = p.scale * (0.6 + rise * 0.8);
        s.set(smokeScale, smokeScale, 1);
        tmpPos.set(x, y, z);
        m.compose(tmpPos, camQuat, s);
        smoke.setMatrixAt(i, m);

        const emberScale = Math.max(0, 1 - rise * 1.3);
        s.set(emberScale, emberScale, emberScale);
        m.compose(tmpPos, camQuat, s);
        embers.setMatrixAt(i, m);
      }
      if (particles.length) {
        smoke.instanceMatrix.needsUpdate = true;
        embers.instanceMatrix.needsUpdate = true;
      }
      smokeMat.opacity = 0.16 * nightBoost + 0.08;
      emberMat.opacity = 0.4 + night * 0.45;

      if (train) {
        train.dist += 5 * dt;
        let d = ((train.dist % train.total) + train.total) % train.total;
        let idx = 0;
        while (idx < train.segLens.length && d > train.segLens[idx]) {
          d -= train.segLens[idx];
          idx++;
        }
        idx = Math.min(idx, train.segLens.length - 1);
        const a = train.pts[idx];
        const b = train.pts[idx + 1];
        const segLen = train.segLens[idx] || 1;
        const t = segLen > 0 ? d / segLen : 0;
        train.group.position.lerpVectors(a, b, t);
        train.group.position.y = 0;
        trainDir.subVectors(b, a);
        train.group.rotation.y = Math.atan2(trainDir.x, trainDir.z);
      }
    },
  };
}
