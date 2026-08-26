/**
 * streetcars.js — one streetcar per city-plan.json streetcarLines entry,
 * gliding at constant speed along its path with the line's rollsign color.
 * Built to read as a proper 1929 trolley: rounded half-cylinder roof, a
 * window band that lights up warm at night (emissive strip + faint flank
 * spill), a route-number signboard next to the destination rollsign, a
 * trolley pole reaching up toward the wire, and a cowcatcher grille on the
 * leading end. Movement, routing, and the exported contract are unchanged.
 */
export function startStreetcars(ctx) {
  const { THREE, scene, plan, materials, deco, getDayPhase } = ctx;
  const SPEED = 9; // m/s, period Birney/center-door car pace

  const cars = [];
  const spillTex = makeSpillTexture(THREE);

  // --- Overhead catenary: poles + sagging contact wire along every grade
  // line (the elevated Belt Loop rides its own guideway and is skipped).
  // One instanced pole mesh + one merged wire geometry — two draw calls.
  buildCatenary(THREE, scene, plan.streetcarLines || []);

  let lineIndex = 0;
  for (const line of plan.streetcarLines || []) {
    const pts = line.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    let total = 0;
    const segLens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      segLens.push(l);
      total += l;
    }
    if (total <= 0 || pts.length < 2) { lineIndex++; continue; }

    const group = new THREE.Group();
    const bodyColor = new THREE.Color(line.color || '#8a6d3a');

    // Underframe / chassis.
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 9.6), materials.steelDark);
    chassis.position.y = 0.32;
    group.add(chassis);

    // Lower body — the painted lacquer shell.
    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.0, 9.5),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.2 })
    );
    lowerBody.position.y = 1.15;
    group.add(lowerBody);

    // Window band — the actual glazing strip; emissive warmth at night.
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f26, roughness: 0.25, metalness: 0.3,
      emissive: 0xffb45e, emissiveIntensity: 0,
    });
    const windowBand = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.9, 9.3), windowMat);
    windowBand.position.y = 2.55;
    group.add(windowBand);

    // Two-tone livery: cream letterboard over the windows, cream belt rail
    // under them, and window pillars breaking the glazing into real sash.
    const cream = new THREE.MeshStandardMaterial({ color: 0xe8ddb8, roughness: 0.5, metalness: 0.1 });
    bodyColor.multiplyScalar(0.78); // de-toy the saturated line colors
    const letterboard = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.26, 9.34), cream);
    letterboard.position.y = 3.06;
    group.add(letterboard);
    const beltRail = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.1, 9.34), cream);
    beltRail.position.y = 2.06;
    group.add(beltRail);
    for (let pIdx = 0; pIdx < 7; pIdx++) {
      const pz = -3.9 + pIdx * 1.3;
      for (const px of [1.28, -1.28]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.94, 0.14), cream);
        pillar.position.set(px, 2.55, pz);
        group.add(pillar);
      }
    }
    // Trucks and wheels under the frame.
    for (const tz of [3.0, -3.0]) {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.9), materials.steelDark);
      truck.position.set(0, 0.36, tz);
      group.add(truck);
      for (const wx of [1.08, -1.08]) {
        for (const wz of [tz + 0.62, tz - 0.62]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 10), materials.steelDark);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(wx, 0.34, wz);
          group.add(wheel);
        }
      }
    }
    // End glazing + cream end panels so the front is a face, not a slab.
    for (const ez of [4.78, -4.78]) {
      const endWin = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.7), windowMat);
      endWin.position.set(0, 2.55, ez);
      if (ez < 0) endWin.rotation.y = Math.PI;
      group.add(endWin);
    }

    // Faint flank spill — warm bleed reading as interior light on the street.
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffdca0, transparent: true, opacity: 0.0, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.0), glowMat);
    glow.position.set(1.34, 2.55, 0);
    glow.rotation.y = Math.PI / 2;
    group.add(glow);
    const glowBackMat = glowMat.clone();
    const glowBack = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.0), glowBackMat);
    glowBack.position.set(-1.34, 2.55, 0);
    glowBack.rotation.y = -Math.PI / 2;
    group.add(glowBack);

    // Rounded roof — open half-cylinder cap plus end discs.
    const roofRadius = 1.32;
    const roofLen = 9.4;
    const roofCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(roofRadius, roofRadius, roofLen, 10, 1, true, Math.PI, Math.PI),
      materials.steelDark
    );
    roofCyl.rotation.x = Math.PI / 2;
    roofCyl.position.y = 3.0;
    group.add(roofCyl);
    for (const zEnd of [roofLen / 2, -roofLen / 2]) {
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(roofRadius, 10, Math.PI, Math.PI),
        materials.steelDark
      );
      cap.position.set(0, 3.0, zEnd);
      cap.rotation.y = zEnd > 0 ? 0 : Math.PI;
      group.add(cap);
    }

    // Ground-level spill patch — faint warm glow pooling under/around the car.
    const spillMat = new THREE.MeshBasicMaterial({
      map: spillTex, color: 0xffcf8a, transparent: true, opacity: 0.0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 11), spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.y = 0.04;
    group.add(spill);

    // Trolley pole reaching up toward the overhead wire.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.4, 6), materials.steelDark);
    pole.position.set(0, 4.1, -1.4);
    pole.rotation.x = -0.32;
    group.add(pole);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), materials.bronze);
    shoe.position.set(0, 5.2, -2.15);
    group.add(shoe);

    // Cowcatcher grille on the leading (+Z) end.
    const apron = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 0.35), materials.steelDark);
    apron.position.set(0, 0.45, 5.02);
    apron.rotation.x = -0.35;
    group.add(apron);
    for (let b = 0; b < 4; b++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.05), materials.rail);
      bar.position.set(0, 0.24 + b * 0.11, 5.1);
      group.add(bar);
    }

    // Destination rollsign on the leading face.
    const sign = deco.canvasSign(line.name, { width: 2.2, canvasWidth: 384, canvasHeight: 96 });
    sign.position.set(0, 2.55, 4.78);
    group.add(sign);

    // Small route-number signboard above the rollsign.
    const routeSign = deco.canvasSign(String(lineIndex + 1), { width: 0.7, canvasWidth: 128, canvasHeight: 128 });
    routeSign.position.set(0, 3.35, 4.7);
    group.add(routeSign);

    scene.add(group);
    cars.push({
      group, pts, segLens, total,
      dist: Math.random() * total,
      glowMat, glowBackMat, windowMat, spillMat,
    });
    lineIndex++;
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
        car.windowMat.emissiveIntensity = night * 2.2;
        car.spillMat.opacity = night * 0.35;
      }
    },
  };
}

/** Small radial gradient texture for the ground-level interior spill glow. */
function makeSpillTexture(THREE) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const c2d = canvas.getContext('2d');
  const grad = c2d.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,220,160,0.85)');
  grad.addColorStop(0.5, 'rgba(255,200,130,0.3)');
  grad.addColorStop(1, 'rgba(255,200,130,0)');
  c2d.fillStyle = grad;
  c2d.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


// ---------------------------------------------------------------------
// Catenary network: timber-dark poles every ~32m on alternating sides
// with a bracket arm, and a thin contact wire at 5.55m following each
// route with a gentle sag per span. Wires never cast shadows.
// ---------------------------------------------------------------------
function buildCatenary(THREE, scene, lines) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b241c, roughness: 0.85, metalness: 0.1 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.6 });

  // Pole unit: post + bracket arm + drop, merged once, instanced per pole.
  const parts = [];
  const post = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6);
  post.translate(0, 3.2, 0);
  parts.push(post);
  const arm = new THREE.CylinderGeometry(0.045, 0.045, 5.4, 5);
  arm.rotateZ(Math.PI / 2);
  arm.translate(-2.7, 6.1, 0);
  parts.push(arm);
  const drop = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4);
  drop.translate(-5.2, 5.82, 0);
  parts.push(drop);
  const cap = new THREE.SphereGeometry(0.13, 6, 4);
  cap.translate(0, 6.45, 0);
  parts.push(cap);
  let vc = 0, ic = 0;
  for (const g of parts) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3); const nor = new Float32Array(vc * 3); const uv = new Float32Array(vc * 2);
  const idx = ic > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const poleGeo = new THREE.BufferGeometry();
  poleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  poleGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  poleGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  poleGeo.setIndex(new THREE.BufferAttribute(idx, 1));

  const poleXforms = [];
  const wireBoxes = []; // {ax,ay,az,bx,by,bz}
  const WIRE_Y = 5.55, SPAN = 32, SAG = 0.22;
  for (const line of lines) {
    if (/elevated/i.test(line.name || '') || line.elevated) continue;
    const pts = (line.path || []).map(([x, z]) => new THREE.Vector2(x, z));
    if (pts.length < 2) continue;
    let side = 1, carry = 0, poleCount = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = a.distanceTo(b);
      if (seg < 0.001) continue;
      const dx = (b.x - a.x) / seg, dz = (b.y - a.y) / seg;
      const heading = Math.atan2(dx, dz);
      // wire: subdivide the segment into spans with a sag midpoint
      let d0 = 0;
      while (d0 < seg) {
        const d1 = Math.min(seg, d0 + SPAN);
        const mx = a.x + dx * ((d0 + d1) / 2), mz = a.y + dz * ((d0 + d1) / 2);
        const x0 = a.x + dx * d0, z0 = a.y + dz * d0;
        const x1 = a.x + dx * d1, z1 = a.y + dz * d1;
        wireBoxes.push([x0, WIRE_Y, z0, mx, WIRE_Y - SAG, mz]);
        wireBoxes.push([mx, WIRE_Y - SAG, mz, x1, WIRE_Y, z1]);
        d0 = d1;
      }
      // poles: continue accumulated spacing across vertices
      let dp = carry === 0 ? 6 : SPAN - carry;
      while (dp < seg) {
        const px = a.x + dx * dp, pz = a.y + dz * dp;
        poleXforms.push([px + Math.cos(heading) * 5.2 * side, pz - Math.sin(heading) * 5.2 * side, heading + (side > 0 ? 0 : Math.PI)]);
        side = -side; poleCount++;
        dp += SPAN;
      }
      carry = (seg - (dp - SPAN)) % SPAN;
    }
  }

  const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, poleXforms.length);
  const m4 = new THREE.Matrix4(); const q4 = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0); const one = new THREE.Vector3(1, 1, 1); const tv = new THREE.Vector3();
  poleXforms.forEach(([x, z, h], i) => {
    q4.setFromAxisAngle(up, h);
    tv.set(x, 0, z);
    m4.compose(tv, q4, one);
    poleMesh.setMatrixAt(i, m4);
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  poleMesh.castShadow = true;
  scene.add(poleMesh);

  // Wire: one merged geometry of thin boxes between endpoint pairs.
  const wvc = wireBoxes.length * 8, wic = wireBoxes.length * 36;
  const wpos = new Float32Array(wvc * 3);
  const widx = wvc > 65535 ? new Uint32Array(wic) : new Uint16Array(wic);
  const R = 0.025;
  wireBoxes.forEach(([ax, ay, az, bx, by, bz], bi) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const lx = (-dz / len) * R, lz = (dx / len) * R;
    const corners = [
      [ax + lx, ay - R, az + lz], [ax - lx, ay - R, az - lz], [ax + lx, ay + R, az + lz], [ax - lx, ay + R, az - lz],
      [bx + lx, by - R, bz + lz], [bx - lx, by - R, bz - lz], [bx + lx, by + R, bz + lz], [bx - lx, by + R, bz - lz],
    ];
    corners.forEach((c, ci) => wpos.set(c, (bi * 8 + ci) * 3));
    const o = bi * 8;
    const quads = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
    quads.forEach((qd, qi) => {
      widx.set([o+qd[0],o+qd[1],o+qd[2],o+qd[0],o+qd[2],o+qd[3]], bi*36+qi*6);
    });
  });
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  wireGeo.setIndex(new THREE.BufferAttribute(widx, 1));
  wireGeo.computeVertexNormals();
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  wireMesh.userData.noShadow = true;
  wireMesh.castShadow = false;
  scene.add(wireMesh);
}
