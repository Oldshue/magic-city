/**
 * pedestrians.js — instanced capsule figures walking the sidewalks of
 * avenue-class streets. Density scales with proximity to the Heaviest
 * Corner (dense downtown) versus the industrial edges (sparse). One
 * InstancedMesh, one draw call, allocation-free per frame.
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
        });
      }
    }
  }
  if (people.length > MAX_PEOPLE) people.length = MAX_PEOPLE;

  const COUNT = Math.max(1, people.length);
  const geo = new THREE.CapsuleGeometry(0.24, 1.05, 3, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.92, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const palette = [0x2a2622, 0x39322a, 0x203040, 0x402626, 0x30301c, 0x1c1c1c, 0x3a2c1c];
  for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

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
        const edge = p.route.width / 2 + 2.0;
        const ox = pos.x + nx * edge * p.side;
        const oz = pos.z + nz * edge * p.side;
        const bobY = 0.62 + Math.sin(elapsed * 5 + p.bob) * 0.03;
        q.setFromAxisAngle(up, heading);
        tmpPos.set(ox, bobY, oz);
        m.compose(tmpPos, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.count = people.length;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
