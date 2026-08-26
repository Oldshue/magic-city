/**
 * src/districts/alabama-way-savoy.js
 * Club Savoy interior — a warm speakeasy room built at y=-200 (never
 * collides with the city above). Wired in by alabama-way.js via dynamic
 * import; this module never edits any other district or engine file.
 * ~20 draw calls, all built once; the only per-frame work is a tiny
 * allocation-free movement loop while the player is inside.
 */

export const INTERIOR = { x: 0, y: -200, z: 0 };
export const DOOR_LOCAL = { x: 0, z: 6.4 };
const ROOM = { w: 16, d: 14, h: 4.2 };

export async function build(ctx) {
  const { THREE, scene, materials, registerInteractive } = ctx;
  const room = new THREE.Group();
  room.name = 'club-savoy-interior';
  room.position.set(INTERIOR.x, INTERIOR.y, INTERIOR.z);
  scene.add(room);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c1f16, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb08a2a, metalness: 0.6, roughness: 0.35, emissive: 0x3a2a08, emissiveIntensity: 0.3 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a1f12, roughness: 0.7 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xcc7a1a, emissiveIntensity: 1.4 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x3a2410, emissive: 0xffb060, emissiveIntensity: 1.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.6 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), materials.asphalt || wallMat);
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  room.add(ceiling);

  const q0 = new THREE.Quaternion();
  const qR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const m4 = new THREE.Matrix4();
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, ROOM.h, 0.2), wallMat, 4);
  const trimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.18, 0.22), trimMat, 4);
  const walls = [
    { x: 0, z: -ROOM.d / 2, w: ROOM.w, rot: q0 }, { x: 0, z: ROOM.d / 2, w: ROOM.w, rot: q0 },
    { x: -ROOM.w / 2, z: 0, w: ROOM.d, rot: qR }, { x: ROOM.w / 2, z: 0, w: ROOM.d, rot: qR },
  ];
  walls.forEach((w, i) => {
    m4.compose(new THREE.Vector3(w.x, ROOM.h / 2, w.z), w.rot, new THREE.Vector3(w.w, 1, 1));
    wallMesh.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(w.x, ROOM.h * 0.58, w.z), w.rot, new THREE.Vector3(w.w, 1, 1));
    trimMesh.setMatrixAt(i, m4);
  });
  wallMesh.instanceMatrix.needsUpdate = true;
  trimMesh.instanceMatrix.needsUpdate = true;
  room.add(wallMesh, trimMesh);

  const stageX = 0, stageZ = -ROOM.d / 2 + 2.2;
  const stage = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 3.2), woodMat);
  stage.position.set(stageX, 0.2, stageZ);
  room.add(stage);
  const pianoBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2), darkMat);
  pianoBody.position.set(stageX - 2.3, 0.85, stageZ - 0.3);
  room.add(pianoBody);
  const pianoLid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.1), darkMat);
  pianoLid.position.set(stageX - 2.3, 1.32, stageZ - 0.3);
  room.add(pianoLid);
  const bassBody = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.5, 10), woodMat);
  bassBody.position.set(stageX, 1.1, stageZ);
  room.add(bassBody);
  const bassNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 6), woodMat);
  bassNeck.position.set(stageX, 2.0, stageZ);
  room.add(bassNeck);
  const trumpetBell = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 10), trimMat);
  trumpetBell.rotation.z = Math.PI / 2;
  trumpetBell.position.set(stageX + 2.3, 1.15, stageZ - 0.2);
  room.add(trumpetBell);
  const trumpetBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), trimMat);
  trumpetBody.rotation.z = Math.PI / 2;
  trumpetBody.position.set(stageX + 1.85, 1.15, stageZ - 0.2);
  room.add(trumpetBody);

  const barX = ROOM.w / 2 - 2.4, barZ = 0;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, ROOM.d - 5), woodMat);
  bar.position.set(barX, 0.55, barZ);
  room.add(bar);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, ROOM.d - 6), darkMat);
  shelf.position.set(barX + 1.1, 1.6, barZ);
  room.add(shelf);
  const shelfGlow = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, ROOM.d - 6.2), amberMat);
  shelfGlow.position.set(barX + 1.3, 1.6, barZ);
  room.add(shelfGlow);
  const bottles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6), amberMat, 8);
  for (let i = 0; i < 8; i++) {
    m4.compose(new THREE.Vector3(barX + 1.25, 1.9, barZ - 3.2 + i * 0.85), q0, new THREE.Vector3(1, 1, 1));
    bottles.setMatrixAt(i, m4);
  }
  bottles.instanceMatrix.needsUpdate = true;
  room.add(bottles);

  const tableTops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), woodMat, 6);
  const tableBases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.72, 8), darkMat, 6);
  const glows = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 5), glowMat, 6);
  const tablePositions = [[-5.5, -2], [-5.5, 2], [-1.5, 4.5], [1.8, 4.5], [5.2, -2], [5.2, 2]];
  tablePositions.forEach(([tx, tz], i) => {
    m4.compose(new THREE.Vector3(tx, 0.76, tz), q0, new THREE.Vector3(1, 1, 1));
    tableTops.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(tx, 0.4, tz), q0, new THREE.Vector3(1, 1, 1));
    tableBases.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(tx, 0.82, tz), q0, new THREE.Vector3(1, 1, 1));
    glows.setMatrixAt(i, m4);
  });
  tableTops.instanceMatrix.needsUpdate = true;
  tableBases.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  room.add(tableTops, tableBases, glows);

  const cardHolder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), trimMat);
  cardHolder.position.set(barX - 0.8, 1.05, barZ - 0.3);
  room.add(cardHolder);
  registerInteractive(cardHolder, {
    title: 'House Card',
    body: 'Coffee, served in the back room, 25 cents.',
  });

  const doorMark = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.4, 0.1), trimMat);
  doorMark.position.set(DOOR_LOCAL.x, 1.7, DOOR_LOCAL.z);
  room.add(doorMark);
}

/** Wires the "Enter Club Savoy" doorway E-interaction: teleports the
 * player camera to the interior spawn and back out at the door on the
 * next E. Skips the jazz swell — jazz.js exports only startJazz(ctx),
 * no gain/bus hook to duck, so we leave jazz.js untouched. */
export function wireDoor(ctx, savoyLM, frontSign) {
  const { THREE, camera, controls, registerInteractive, scene } = ctx;
  const [, d] = savoyLM.footprint;
  const rotDeg = savoyLM.rotationYDeg || 0;
  const local = new THREE.Vector3(0, 0, frontSign * (d / 2 + 1.8));
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(rotDeg));
  const doorX = savoyLM.position[0] + local.x, doorZ = savoyLM.position[1] + local.z;
  const doorYaw = rotDeg + (frontSign > 0 ? 180 : 0);

  const marker = new THREE.Object3D();
  marker.position.set(doorX, 1.7, doorZ);
  scene.add(marker);
  registerInteractive(marker, {
    title: 'Enter Club Savoy',
    body: 'A narrow door, a narrower hallway. Press E at the threshold to slip inside — press E by the back bar to step out.',
  });

  let inside = false;
  const moveKeys = Object.create(null);
  document.addEventListener('keydown', (e) => {
    moveKeys[e.code] = true;
    if (e.code !== 'KeyE') return;
    if (!inside) {
      const dx = camera.position.x - doorX, dz = camera.position.z - doorZ;
      if (dx * dx + dz * dz < 16) {
        inside = true;
        controls.setEnabled(false);
        camera.position.set(INTERIOR.x + DOOR_LOCAL.x, INTERIOR.y + 1.7, INTERIOR.z + DOOR_LOCAL.z - 1.2);
        camera.rotation.set(0, Math.PI, 0);
      }
    } else {
      const dx = camera.position.x - (INTERIOR.x + DOOR_LOCAL.x), dz = camera.position.z - (INTERIOR.z + DOOR_LOCAL.z);
      if (dx * dx + dz * dz < 16) {
        inside = false;
        controls.setEnabled(true);
        controls.setSpawn([doorX, doorZ + frontSign * 2], doorYaw);
      }
    }
  });
  document.addEventListener('keyup', (e) => { moveKeys[e.code] = false; });

  let last = null;
  function tick(t) {
    requestAnimationFrame(tick);
    if (!inside) { last = t; return; }
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
    last = t;
    const ix = (moveKeys['KeyD'] ? 1 : 0) - (moveKeys['KeyA'] ? 1 : 0);
    const iz = (moveKeys['KeyS'] ? 1 : 0) - (moveKeys['KeyW'] ? 1 : 0);
    if (ix || iz) {
      const len = Math.hypot(ix, iz) || 1;
      camera.position.x = THREE.MathUtils.clamp(camera.position.x + (ix / len) * 3 * dt, INTERIOR.x - 7, INTERIOR.x + 7);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + (iz / len) * 3 * dt, INTERIOR.z - 6, INTERIOR.z + 6);
    }
    camera.position.y = INTERIOR.y + 1.7;
  }
  tick();
}
