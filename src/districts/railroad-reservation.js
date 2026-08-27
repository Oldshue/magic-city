/**
 * railroad-reservation.js — District: The Railroad Reservation
 *
 * Phase 1: the corridor ground layer. Builds within the reservation
 * polygon (x -520..520, z 78..318): packed cinder ground, at-grade yard
 * tracks (north + south yards), the raised 1929 through-line embankment
 * with ashlar retaining walls and four main tracks on top, abutment
 * towers at the 20th/18th underpasses, buffer stops at the dead-end
 * streets along Morris Avenue, continuous edge fencing, sidings, yard
 * clutter, telegraph pole lines, and floodlight masts. Phase 2 will add
 * the 21st/22nd Street viaduct spans over the two wide gaps left here.
 */
import * as THREE from '../../vendor/three.module.min.js';

export async function build(ctx) {
  const { THREE: T = THREE, scene, district, registerInteractive } = ctx;
  void registerInteractive;
  const group = new THREE.Group();
  group.name = 'district-railroad-reservation';

  const poly = district.polygon;
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);

  // ------------------------------------------------------------------
  // Local materials (corridor palette — distinct from the shared civic
  // palette; ash/ballast/creosote/iron greys, not building stone).
  // ------------------------------------------------------------------
  const cinderMat = new T.MeshStandardMaterial({ color: 0x574f43, roughness: 1.0, metalness: 0.0 });
  const ballastMat = new T.MeshStandardMaterial({ color: 0x6e6156, roughness: 0.95, metalness: 0.0 });
  const tieMat = new T.MeshStandardMaterial({ color: 0x33281c, roughness: 0.92, metalness: 0.0 });
  const railMat = new T.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.35, metalness: 0.85 });
  const ashlarMat = new T.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.88, metalness: 0.04 });
  const ironMat = new T.MeshStandardMaterial({ color: 0x3a362f, roughness: 0.55, metalness: 0.65 });
  const drumMat = new T.MeshStandardMaterial({ color: 0x53412a, roughness: 0.7, metalness: 0.3 });
  const woodMat = new T.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.85, metalness: 0.0 });
  const glowMat = new T.MeshBasicMaterial({ color: 0xffeec2 });

  // ------------------------------------------------------------------
  // Street gaps — at-grade tracks/ballast break here so 20th and 18th
  // pass under the corridor; 21st and 22nd are the wider phase-2
  // viaduct gaps (no ground/track/fence crosses them at all yet).
  // ------------------------------------------------------------------
  const GAP_20TH = [-14, 14];
  const GAP_18TH = [226, 254];
  const SEGMENTS = [[minX, GAP_20TH[0]], [GAP_20TH[1], GAP_18TH[0]], [GAP_18TH[1], maxX]];
  // Fence gaps: 22nd viaduct span, 21st viaduct span, 20th crossing, 18th crossing.
  const FENCE_GAPS = [[-262, -218], [-142, -98], [-11, 11], [232, 248]];
  const FENCE_SEGMENTS = [
    [minX, FENCE_GAPS[0][0]],
    [FENCE_GAPS[0][1], FENCE_GAPS[1][0]],
    [FENCE_GAPS[1][1], FENCE_GAPS[2][0]],
    [FENCE_GAPS[2][1], FENCE_GAPS[3][0]],
    [FENCE_GAPS[3][1], maxX],
  ];

  // ------------------------------------------------------------------
  // 1. Corridor ground �� packed cinder/ash plane, full band.
  // ------------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), cinderMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, 0.05, (minZ + maxZ) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // ------------------------------------------------------------------
  // 2. Track ribbon builder — ballast + two rails per SEGMENT, ties
  // collected into a shared array for one InstancedMesh at the end.
  // ------------------------------------------------------------------
  const tieMatrices = []; // [x, y, z]
  const BALLAST_H = 0.12, TIE_H = 0.16, RAIL_H = 0.16;
  function buildTrackRibbon(zCenter, baseY, segments = SEGMENTS) {
    const ballastY = baseY + BALLAST_H / 2;
    const tieY = baseY + BALLAST_H + TIE_H / 2;
    const railY = baseY + BALLAST_H + TIE_H + RAIL_H / 2;
    for (const [sx0, sx1] of segments) {
      const len = sx1 - sx0;
      if (len <= 0) continue;
      const midX = (sx0 + sx1) / 2;
      const ballast = new THREE.Mesh(new THREE.BoxGeometry(len, BALLAST_H, 4), ballastMat);
      ballast.position.set(midX, ballastY, zCenter);
      ballast.receiveShadow = true;
      group.add(ballast);
      for (const off of [-0.72, 0.72]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, RAIL_H, 0.14), railMat);
        rail.position.set(midX, railY, zCenter + off);
        rail.userData.noShadow = true;
        group.add(rail);
      }
      const spacing = 0.85;
      const n = Math.floor(len / spacing);
      for (let i = 0; i <= n; i++) {
        const tx = sx0 + i * spacing;
        if (tx > sx1) break;
        tieMatrices.push([tx, tieY, zCenter]);
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Yard tracks at grade — 4 north yard (z 95..165), 4 south yard
  // (z 230..300).
  // ------------------------------------------------------------------
  const NORTH_YARD_Z = [95, 118, 142, 165];
  const SOUTH_YARD_Z = [230, 253, 277, 300];
  for (const z of NORTH_YARD_Z) buildTrackRibbon(z, 0);
  for (const z of SOUTH_YARD_Z) buildTrackRibbon(z, 0);

  // ------------------------------------------------------------------
  // 4. The embankment — raised through-line, z 175..220, x full span
  // minus street gaps. Trapezoid cross-section approximated as two
  // stacked boxes (base 42 wide / 2m, top 34 wide / 2m => 4m total),
  // battered ashlar retaining walls both faces, 4 main tracks on top.
  // ------------------------------------------------------------------
  const EMB_Z = 197.5;
  const EMB_BASE_W = 42, EMB_TOP_W = 34;
  const EMB_BASE_H = 2.0, EMB_TOP_H = 2.0;
  const EMB_TOTAL_H = EMB_BASE_H + EMB_TOP_H;
  for (const [sx0, sx1] of SEGMENTS) {
    const len = sx1 - sx0;
    if (len <= 0) continue;
    const midX = (sx0 + sx1) / 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, EMB_BASE_H, EMB_BASE_W), ashlarMat);
    base.position.set(midX, EMB_BASE_H / 2, EMB_Z);
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(len, EMB_TOP_H, EMB_TOP_W), ashlarMat);
    top.position.set(midX, EMB_BASE_H + EMB_TOP_H / 2, EMB_Z);
    top.castShadow = true; top.receiveShadow = true;
    group.add(top);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 4.2, 1.1), ashlarMat);
      wall.position.set(midX, 2.1, EMB_Z + side * (EMB_BASE_W / 2 - 0.55));
      wall.rotation.x = side * -0.035;
      wall.castShadow = true; wall.receiveShadow = true;
      group.add(wall);
    }
  }
  const MAIN_Z = [EMB_Z - 12, EMB_Z - 4, EMB_Z + 4, EMB_Z + 12];
  for (const z of MAIN_Z) buildTrackRibbon(z, EMB_TOTAL_H);

  // ------------------------------------------------------------------
  // 4b. Abutment towers — square stone piers flanking each street gap
  // where the embankment ends; phase 2 spans the girders between them.
  // ------------------------------------------------------------------
  const abutGeo = new THREE.BoxGeometry(5, 5.5, 5);
  const abutXs = [GAP_20TH[0], GAP_20TH[1], GAP_18TH[0], GAP_18TH[1]];
  const abutZs = [EMB_Z - (EMB_BASE_W / 2 - 0.55), EMB_Z + (EMB_BASE_W / 2 - 0.55)];
  {
    const abutInst = new T.InstancedMesh(abutGeo, ashlarMat, abutXs.length * abutZs.length);
    abutInst.castShadow = true; abutInst.receiveShadow = true;
    const m4 = new T.Matrix4();
    let i = 0;
    for (const ax of abutXs) {
      for (const az of abutZs) {
        m4.makeTranslation(ax, 2.75, az);
        abutInst.setMatrixAt(i++, m4);
      }
    }
    abutInst.instanceMatrix.needsUpdate = true;
    group.add(abutInst);
  }

  // ------------------------------------------------------------------
  // 5. Buffer stops at dead-end street stubs along Morris (19th, 17th,
  // 16th, 15th, 23rd, 24th), just inside the corridor's north edge, plus
  // fence segments closing each street mouth at z=78 and z=318.
  // ------------------------------------------------------------------
  const DEADEND_XS = [120, 360, 480, 600, -360, -480];
  const bufferRailGeo = new THREE.BoxGeometry(3, 0.14, 0.12);
  const bufferBlockGeo = new THREE.BoxGeometry(0.5, 0.9, 1.6);
  {
    const railInst = new T.InstancedMesh(bufferRailGeo, railMat, DEADEND_XS.length * 2);
    const blockInst = new T.InstancedMesh(bufferBlockGeo, ironMat, DEADEND_XS.length);
    railInst.userData.noShadow = true;
    const m4 = new T.Matrix4();
    DEADEND_XS.forEach((x, i) => {
      for (const off of [-0.5, 0.5]) {
        m4.makeTranslation(x + off, 0.24, minZ + 3.2);
        railInst.setMatrixAt(i * 2 + (off < 0 ? 0 : 1), m4);
      }
      m4.makeTranslation(x, 0.6, minZ + 4.7);
      blockInst.setMatrixAt(i, m4);
    });
    railInst.instanceMatrix.needsUpdate = true;
    blockInst.instanceMatrix.needsUpdate = true;
    group.add(railInst, blockInst);
  }
  {
    const mouthGeo = new THREE.BoxGeometry(16, 2, 0.12);
    const mouthInst = new T.InstancedMesh(mouthGeo, ironMat, DEADEND_XS.length * 2);
    mouthInst.userData.noShadow = true;
    const m4 = new T.Matrix4();
    DEADEND_XS.forEach((x, i) => {
      m4.makeTranslation(x, 1.0, minZ);
      mouthInst.setMatrixAt(i * 2, m4);
      m4.makeTranslation(x, 1.0, maxZ);
      mouthInst.setMatrixAt(i * 2 + 1, m4);
    });
    mouthInst.instanceMatrix.needsUpdate = true;
    group.add(mouthInst);
  }

  // ------------------------------------------------------------------
  // 6. Corridor edge fences — continuous low iron picket fence at
  // z=78 and z=318, broken at 20th/18th crossings and the 21st/22nd
  // viaduct spans (FENCE_SEGMENTS already excludes those gaps).
  // ------------------------------------------------------------------
  {
    const postGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08);
    const postPositions = [];
    for (const z of [minZ, maxZ]) {
      for (const [sx0, sx1] of FENCE_SEGMENTS) {
        const len = sx1 - sx0;
        if (len <= 0) continue;
        const n = Math.max(1, Math.floor(len / 3));
        for (let i = 0; i <= n; i++) {
          const x = sx0 + Math.min(len, i * 3);
          postPositions.push([x, 0.5, z]);
        }
        const railTop = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), ironMat);
        railTop.position.set((sx0 + sx1) / 2, 0.92, z);
        railTop.userData.noShadow = true;
        group.add(railTop);
        const railMid = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), ironMat);
        railMid.position.set((sx0 + sx1) / 2, 0.5, z);
        railMid.userData.noShadow = true;
        group.add(railMid);
      }
    }
    const postInst = new T.InstancedMesh(postGeo, ironMat, postPositions.length);
    postInst.userData.noShadow = true;
    const m4 = new T.Matrix4();
    postPositions.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y, z);
      postInst.setMatrixAt(i, m4);
    });
    postInst.instanceMatrix.needsUpdate = true;
    group.add(postInst);
  }

  // ------------------------------------------------------------------
  // 7. Sidings, crosstie stacks, telegraph pole lines, switch stands,
  // water columns, oil drums.
  // ------------------------------------------------------------------
  // Two short stub sidings angling off the north yard toward Morris
  // between 16th (480) and 15th (600).
  buildTrackRibbon(84, 0, [[500, 560]]);
  buildTrackRibbon(88, 0, [[520, 585]]);

  // Crosstie stacks near the north yard.
  {
    const stackGeo = new THREE.BoxGeometry(2.6, 0.22, 0.22);
    const stackSpots = [[-380, 178], [-200, 178], [300, 178], [420, 178], [-60, 320 - 12]];
    const total = stackSpots.length * 5;
    const stackInst = new T.InstancedMesh(stackGeo, tieMat, total);
    const m4 = new T.Matrix4();
    let si = 0;
    stackSpots.forEach(([x, z]) => {
      for (let layer = 0; layer < 5; layer++) {
        m4.makeTranslation(x, 0.11 + layer * 0.24, z);
        stackInst.setMatrixAt(si++, m4);
      }
    });
    stackInst.instanceMatrix.needsUpdate = true;
    group.add(stackInst);
  }

  // Three telegraph pole lines running the corridor length, poles every
  // 28m, three crossarms each, no wires this phase.
  {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6.5, 6);
    const armGeo = new THREE.BoxGeometry(1.6, 0.08, 0.08);
    const lineZs = [86, 210, 310];
    const poleXs = [];
    for (let x = minX + 10; x <= maxX - 10; x += 28) poleXs.push(x);
    const totalPoles = poleXs.length * lineZs.length;
    const poleInst = new T.InstancedMesh(poleGeo, woodMat, totalPoles);
    const armInst = new T.InstancedMesh(armGeo, woodMat, totalPoles * 3);
    poleInst.userData.noShadow = true;
    armInst.userData.noShadow = true;
    const m4 = new T.Matrix4();
    let pi = 0, ai = 0;
    for (const z of lineZs) {
      for (const x of poleXs) {
        m4.makeTranslation(x, 3.25, z);
        poleInst.setMatrixAt(pi++, m4);
        for (const armY of [5.6, 6.0, 6.4]) {
          m4.makeTranslation(x, armY, z);
          armInst.setMatrixAt(ai++, m4);
        }
      }
    }
    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    group.add(poleInst, armInst);
  }

  // Six switch stands — small lever posts near yard track ends.
  {
    const standGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6);
    const leverGeo = new THREE.BoxGeometry(0.4, 0.06, 0.06);
    const spots = [[-400, 100], [-100, 165], [200, 100], [350, 165], [-300, 260], [150, 295]];
    const standInst = new T.InstancedMesh(standGeo, ironMat, spots.length);
    const leverInst = new T.InstancedMesh(leverGeo, railMat, spots.length);
    const m4 = new T.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.45, z + 2.2);
      standInst.setMatrixAt(i, m4);
      m4.makeTranslation(x + 0.25, 0.85, z + 2.2);
      leverInst.setMatrixAt(i, m4);
    });
    standInst.instanceMatrix.needsUpdate = true;
    leverInst.instanceMatrix.needsUpdate = true;
    group.add(standInst, leverInst);
  }

  // Four water columns/standpipes near track ends.
  {
    const pipeGeo = new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8);
    const armGeo2 = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6);
    const spots = [[-470, 108], [560, 108], [-470, 288], [560, 288]];
    const pipeInst = new T.InstancedMesh(pipeGeo, railMat, spots.length);
    const armInst2 = new T.InstancedMesh(armGeo2, railMat, spots.length);
    const m4 = new T.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 1.6, z + 3);
      pipeInst.setMatrixAt(i, m4);
      m4.makeRotationZ(Math.PI / 2);
      m4.setPosition(x + 0.7, 3.0, z + 3);
      armInst2.setMatrixAt(i, m4);
    });
    pipeInst.instanceMatrix.needsUpdate = true;
    armInst2.instanceMatrix.needsUpdate = true;
    group.add(pipeInst, armInst2);
  }

  // Scattered oil drums.
  {
    const drumGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10);
    const spots = [[-340, 172], [-330, 174], [260, 176], [270, 220], [-40, 224], [400, 218], [-460, 250], [480, 260]];
    const drumInst = new T.InstancedMesh(drumGeo, drumMat, spots.length);
    const m4 = new T.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.45, z);
      drumInst.setMatrixAt(i, m4);
    });
    drumInst.instanceMatrix.needsUpdate = true;
    group.add(drumInst);
  }

  // ------------------------------------------------------------------
  // 8. Yard floodlight masts — 8 poles, 12m tall, 2-head warm dim glow
  // (no PointLights; heaviest-corner uses the shared lamp-pool idiom for
  // street lamps only, so floodlights here are glow-only per instructions).
  // ------------------------------------------------------------------
  {
    const mastGeo = new THREE.CylinderGeometry(0.14, 0.2, 12, 8);
    const headGeo = new THREE.BoxGeometry(0.5, 0.3, 0.9);
    const mastPositions = [
      [-460, 130], [-300, 130], [-140, 130], [140, 130],
      [-460, 260], [-300, 260], [-140, 260], [140, 260],
    ];
    const mastInst = new T.InstancedMesh(mastGeo, ironMat, mastPositions.length);
    const headInst = new T.InstancedMesh(headGeo, glowMat, mastPositions.length * 2);
    mastInst.userData.noShadow = true;
    const m4m = new T.Matrix4(), m4h = new T.Matrix4();
    mastPositions.forEach(([x, z], i) => {
      m4m.makeTranslation(x, 6, z);
      mastInst.setMatrixAt(i, m4m);
      m4h.makeTranslation(x - 0.3, 12, z);
      headInst.setMatrixAt(i * 2, m4h);
      m4h.makeTranslation(x + 0.3, 12, z);
      headInst.setMatrixAt(i * 2 + 1, m4h);
    });
    mastInst.instanceMatrix.needsUpdate = true;
    headInst.instanceMatrix.needsUpdate = true;
    group.add(mastInst, headInst);
  }

  // ------------------------------------------------------------------
  // 10. TIER 1a — Underpass girder spans at 20th St (x=0) and 18th St
  // (x=240): the 1929 grade separation. Riveted plate-girder deck seated
  // on the phase-1 abutment towers, carrying the 4 main tracks over the
  // street gap so the through line reads continuous; caged utility
  // lamps light the underpass at night; retaining wings flare from the
  // abutments toward the street.
  // ------------------------------------------------------------------
  const girderMat = new T.MeshStandardMaterial({ color: 0x3c2a22, roughness: 0.6, metalness: 0.6 });
  const lampCageMat = new T.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.6, metalness: 0.4 });
  const lampDimMat = new T.MeshStandardMaterial({ color: 0x3a2c18, emissive: 0xffb066, emissiveIntensity: 0.7, roughness: 0.5 });
  const gateMat = new T.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.7, metalness: 0.0 });
  const UNDERPASSES = [
    { x0: GAP_20TH[0], x1: GAP_20TH[1] },
    { x0: GAP_18TH[0], x1: GAP_18TH[1] },
  ];
  const GIRDER_Z_OFF = EMB_TOP_W / 2 - 1; // 16
  const DECK_TOP_Y = EMB_TOTAL_H; // 4 — matches embankment top so mains ride level
  {
    const spanLen = 30;
    for (const { x0, x1 } of UNDERPASSES) {
      const cx = (x0 + x1) / 2;
      for (const side of [-1, 1]) {
        const gz = EMB_Z + side * GIRDER_Z_OFF;
        const girder = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 1.6, 0.2), girderMat);
        girder.position.set(cx, DECK_TOP_Y - 0.8, gz);
        girder.castShadow = true; girder.receiveShadow = true;
        group.add(girder);
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 2, 0.15, EMB_TOP_W), ironMat);
      plate.position.set(cx, DECK_TOP_Y + 0.02, EMB_Z);
      plate.receiveShadow = true;
      group.add(plate);
      // Retaining wings flaring from the abutment corners toward the street.
      for (const az of [EMB_Z - GIRDER_Z_OFF - 1, EMB_Z + GIRDER_Z_OFF + 1]) {
        for (const ax of [x0, x1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 0.6), ashlarMat);
          wing.position.set(ax + (ax === x0 ? -2 : 2), 1.6, az + (az < EMB_Z ? -1.6 : 1.6));
          wing.rotation.y = (ax === x0 ? 1 : -1) * 0.5;
          wing.castShadow = true; wing.receiveShadow = true;
          group.add(wing);
        }
      }
      // The 4 main tracks continue over the deck, gapped segment only.
      for (const z of MAIN_Z) buildTrackRibbon(z, DECK_TOP_Y, [[x0, x1]]);
    }
    // Caged utility lamps under the deck — warm dim emissive discs only.
    const lampSpots = [];
    for (const { x0, x1 } of UNDERPASSES) {
      const cx = (x0 + x1) / 2;
      for (const lx of [cx - 7, cx + 7]) {
        for (const lz of [EMB_Z - 8, EMB_Z + 8]) lampSpots.push([lx, DECK_TOP_Y - 1.1, lz]);
      }
    }
    const cageGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const discGeo = new THREE.CircleGeometry(0.16, 8);
    const cageInst = new T.InstancedMesh(cageGeo, lampCageMat, lampSpots.length);
    const discInst = new T.InstancedMesh(discGeo, lampDimMat, lampSpots.length);
    cageInst.userData.noShadow = true; discInst.userData.noShadow = true;
    const m4c = new T.Matrix4();
    lampSpots.forEach(([x, y, z], i) => {
      m4c.makeTranslation(x, y, z);
      cageInst.setMatrixAt(i, m4c);
      m4c.makeRotationX(-Math.PI / 2);
      m4c.setPosition(x, y - 0.16, z);
      discInst.setMatrixAt(i, m4c);
    });
    cageInst.instanceMatrix.needsUpdate = true;
    discInst.instanceMatrix.needsUpdate = true;
    group.add(cageInst, discInst);
  }

  // ------------------------------------------------------------------
  // 11. TIER 1b — At-grade crossing gates + watchman's shanty. The yard
  // tracks break at 20th/18th (SEGMENTS already gaps them); white timber
  // gates lowered across the street mark the at-grade crossing, and a
  // watchman's shanty sits beside the 20th St crossing on the north yard.
  // ------------------------------------------------------------------
  {
    const gateGeo = new THREE.BoxGeometry(9, 0.16, 0.16);
    const gateSpots = [
      { x: 0, z: NORTH_YARD_Z[0] - 6 }, { x: 0, z: SOUTH_YARD_Z[SOUTH_YARD_Z.length - 1] + 6 },
      { x: 240, z: NORTH_YARD_Z[0] - 6 }, { x: 240, z: SOUTH_YARD_Z[SOUTH_YARD_Z.length - 1] + 6 },
    ];
    const gateInst = new T.InstancedMesh(gateGeo, gateMat, gateSpots.length);
    const m4g = new T.Matrix4();
    const gq = new T.Quaternion();
    gateSpots.forEach(({ x, z }, i) => {
      gq.setFromEuler(new T.Euler(0, 0, 15 * Math.PI / 180));
      m4g.compose(new T.Vector3(x, 1.1, z), gq, new T.Vector3(1, 1, 1));
      gateInst.setMatrixAt(i, m4g);
    });
    gateInst.instanceMatrix.needsUpdate = true;
    group.add(gateInst);

    // Watchman's shanty — 20th St crossing, north yard side.
    const shantyGroup = new THREE.Group();
    const shantyBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), woodMat);
    shantyBody.position.y = 1.3;
    shantyBody.castShadow = true; shantyBody.receiveShadow = true;
    shantyGroup.add(shantyBody);
    const shantyRoof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 4), ashlarMat);
    shantyRoof.rotation.y = Math.PI / 4;
    shantyRoof.position.y = 2.6 + 0.55;
    shantyGroup.add(shantyRoof);
    shantyGroup.position.set(22, 0, NORTH_YARD_Z[0] - 10);
    group.add(shantyGroup);
  }

  // ------------------------------------------------------------------
  // 9. Finalize ties — one InstancedMesh for every tie in the corridor
  // (at-grade yard tracks, mains on the embankment, and the two siding
  // stubs all pushed into the same shared tieMatrices array above). Ties
  // run perpendicular to the east-west rails: 0.22 wide along x (the
  // track direction), 2.6 long along z (spanning both rails).
  // ------------------------------------------------------------------
  if (tieMatrices.length) {
    const tieGeo = new THREE.BoxGeometry(0.22, TIE_H, 2.6);
    const tieInst = new T.InstancedMesh(tieGeo, tieMat, tieMatrices.length);
    tieInst.userData.noShadow = true;
    const m4 = new T.Matrix4();
    tieMatrices.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y, z);
      tieInst.setMatrixAt(i, m4);
    });
    tieInst.instanceMatrix.needsUpdate = true;
    group.add(tieInst);
  }

  scene.add(group);
}
