/**
 * streetcars.js — one streetcar per city-plan.json streetcarLines entry,
 * gliding at constant speed along its path with the line's rollsign color,
 * a canvas destination sign, and interior glow that brightens at night.
 */
export function startStreetcars(ctx) {
  const { THREE, scene, plan, materials, deco, getDayPhase } = ctx;
  const SPEED = 9; // m/s, period Birney/center-door car pace

  const cars = [];

  for (const line of plan.streetcarLines || []) {
    const pts = line.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    let total = 0;
    const segLens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      segLens.push(l);
      total += l;
    }
    if (total <= 0 || pts.length < 2) continue;

    const group = new THREE.Group();
    const bodyColor = new THREE.Color(line.color || '#8a6d3a');

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 3.1, 9.5),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.2 })
    );
    body.position.y = 1.7;
    group.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.35, 9.6), materials.steelDark);
    roof.position.y = 3.4;
    group.add(roof);

    // Interior glow strips on both flanks — visible warmth at night.
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffdca0, transparent: true, opacity: 0.0 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.6), glowMat);
    glow.position.set(1.32, 1.75, 0);
    glow.rotation.y = Math.PI / 2;
    group.add(glow);
    const glowBackMat = glowMat.clone();
    const glowBack = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.6), glowBackMat);
    glowBack.position.set(-1.32, 1.75, 0);
    glowBack.rotation.y = -Math.PI / 2;
    group.add(glowBack);

    // Destination rollsign on the leading face.
    const sign = deco.canvasSign(line.name, { width: 2.2, canvasWidth: 384, canvasHeight: 96 });
    sign.position.set(0, 2.55, 4.78);
    group.add(sign);

    scene.add(group);
    cars.push({
      group, pts, segLens, total,
      dist: Math.random() * total,
      glowMat, glowBackMat,
    });
  }

  const carPositions = cars.map((c) => c.group.position);

  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function sampleAt(car, dist) {
    let d = ((dist % car.total) + car.total) % car.total;
    let i = 0;
    while (i < car.segLens.length && d > car.segLens[i]) {
      d -= car.segLens[i];
      i++;
    }
    i = Math.min(i, car.segLens.length - 1);
    const a = car.pts[i];
    const b = car.pts[i + 1];
    const segLen = car.segLens[i] || 1;
    const t = segLen > 0 ? d / segLen : 0;
    pos.lerpVectors(a, b, t);
    dir.subVectors(b, a);
    return Math.atan2(dir.x, dir.z);
  }

  return {
    /** Stable array of the live streetcar positions (mutated in place, not reallocated). */
    getCarPositions() {
      return carPositions;
    },
    /** Additive hook: live car state objects ({ group, pts, segLens, total, dist, ... }),
     * same array reference every call. `group.position`/`group.rotation.y` are updated in
     * place each update() — for systems (e.g. driving.js boarding) that need to attach the
     * camera to a moving streetcar without reaching into module-private closures. */
    getCars() {
      return cars;
    },
    update(dt) {
      const phase = getDayPhase();
      const night = phase < 0.22 || phase > 0.8 ? 1 : 0;
      const op = night * 0.85;
      for (const car of cars) {
        car.dist += SPEED * dt;
        const heading = sampleAt(car, car.dist);
        car.group.position.set(pos.x, 0.15, pos.z);
        car.group.rotation.y = heading;
        car.glowMat.opacity = op;
        car.glowBackMat.opacity = op;
      }
    },
  };
}
