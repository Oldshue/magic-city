/**
 * traffic.js — instanced period automobiles driving avenue-class streets.
 * Box-art 1920s sedan silhouettes (chassis + cabin + headlight pair), dark
 * lacquer colors, headlights that light up at night. Fully instanced: four
 * draw calls total no matter how many cars are on the road.
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
  const bodyGeo = new THREE.BoxGeometry(1.9, 1.35, 4.3);
  const cabinGeo = new THREE.BoxGeometry(1.5, 0.65, 2.2);
  const lampGeo = new THREE.SphereGeometry(0.11, 6, 6);

  const lacquer = [0x151515, 0x1c2430, 0x2a1414, 0x14201c, 0x201810, 0x101015];
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45, metalness: 0.35, vertexColors: true });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.6, metalness: 0.1 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.0 });

  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, COUNT);
  const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, COUNT);
  const lampL = new THREE.InstancedMesh(lampGeo, lampMat, COUNT);
  const lampR = new THREE.InstancedMesh(lampGeo, lampMat, COUNT);
  for (let i = 0; i < COUNT; i++) bodyMesh.setColorAt(i, new THREE.Color(lacquer[i % lacquer.length]));
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  scene.add(bodyMesh, cabinMesh, lampL, lampR);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
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

  return {
    update(dt) {
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;
      for (let i = 0; i < instances.length; i++) {
        const car = instances[i];
        car.dist += car.speed * car.dir * dt;
        sample(car.route, car.dist);
        const heading = Math.atan2(segDir.x * car.dir, segDir.z * car.dir);
        const nx = Math.cos(heading);
        const nz = -Math.sin(heading);
        const ox = pos.x + nx * car.laneOffset * car.dir;
        const oz = pos.z + nz * car.laneOffset * car.dir;

        q.setFromAxisAngle(up, heading);
        tmpPos.set(ox, 0.62, oz);
        m.compose(tmpPos, q, s);
        bodyMesh.setMatrixAt(i, m);

        tmpPos.set(ox, 1.28, oz);
        m.compose(tmpPos, q, s);
        cabinMesh.setMatrixAt(i, m);

        const fx = ox + segDir.x * car.dir * 2.2;
        const fz = oz + segDir.z * car.dir * 2.2;
        const lx = Math.sin(heading) * 0.55;
        const lz = Math.cos(heading) * 0.55;
        tmpPos.set(fx + lx, 0.55, fz + lz);
        m.compose(tmpPos, q, s);
        lampL.setMatrixAt(i, m);
        tmpPos.set(fx - lx, 0.55, fz - lz);
        m.compose(tmpPos, q, s);
        lampR.setMatrixAt(i, m);
      }
      bodyMesh.count = instances.length;
      cabinMesh.count = instances.length;
      lampL.count = instances.length;
      lampR.count = instances.length;
      bodyMesh.instanceMatrix.needsUpdate = true;
      cabinMesh.instanceMatrix.needsUpdate = true;
      lampL.instanceMatrix.needsUpdate = true;
      lampR.instanceMatrix.needsUpdate = true;
      lampMat.opacity = night ? 0.9 : 0.0;
    },
  };
}
