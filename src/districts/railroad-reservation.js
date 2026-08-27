/**
 * railroad-reservation.js — District: The Railroad Reservation
 *
 * Phase 1: the corridor ground layer. Builds within the reservation
 * polygon (x -520..520, z 78..318): packed cinder ground, at-grade yard
 * tracks (north + south yards), the raised 1929 through-line embankment
 * with ashlar retaining walls and four main tracks on top, abutment
 * towers at the 20th/18th underpasses, buffer stops at the dead-end
 * streets along Morris Avenue, continuous edge fencing, sidings, yard
 * clutter, telegraph pole lines, and floodlight masts. Phase 2 adds the
 * 21st/22nd Street viaduct spans over the two wide gaps left here, plus
 * Union Station and rolling stock (see TIER 2 / 3 / 4 sections below).
 */
import * as THREE from '../../vendor/three.module.min.js';

export async function build(ctx) {
  const { THREE: T = THREE, scene, district, registerInteractive, materials, deco } = ctx;
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
  // 1. Corridor ground — packed cinder/ash plane, full band.
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

  // ------------------------------------------------------------------
  // 12. TIER 2 — ITEMS 1 & 2: 21st & 22nd Street viaducts (x=-120,
  // x=-240): elevated street decks 9m above grade crossing the whole
  // corridor, ramps at both ends, steel trestle bents under the flat
  // span (skipping the embankment, which continues beneath unbroken),
  // balustrade lamps. Built from ONE shared set of instanced parts
  // driven by VIADUCT_XS so both spans share geometry/instancing.
  // ------------------------------------------------------------------
  const VIADUCT_XS = [-120, -240];
  const V_DECK_W = 14, V_DECK_T = 0.4, V_BAL_H = 1.1, V_BAL_T = 0.3;
  const V_XOFF = V_DECK_W / 2 - V_BAL_T / 2;
  const RAMP_N0 = 20, RAMP_N1 = 78, RAMP_S0 = 318, RAMP_S1 = 378, DECK_Y = 9;
  function viaductY(z) {
    if (z < RAMP_N1) return DECK_Y * (z - RAMP_N0) / (RAMP_N1 - RAMP_N0);
    if (z > RAMP_S0) return DECK_Y * (1 - (z - RAMP_S0) / (RAMP_S1 - RAMP_S0));
    return DECK_Y;
  }
  function tiltSlab(cx, z0, z1, y0, y1, w, t, material) {
    const run = z1 - z0, rise = y1 - y0;
    const len = Math.sqrt(run * run + rise * rise);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, t, len), material);
    mesh.position.set(cx, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.rotation.x = Math.atan2(rise, run);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  const deckMat = (materials && materials.asphalt) || ashlarMat;
  const balMat = (materials && materials.limestone) || ashlarMat;
  const DECK_SPANS = [[RAMP_N0, RAMP_N1, 0, DECK_Y], [RAMP_N1, RAMP_S0, DECK_Y, DECK_Y], [RAMP_S0, RAMP_S1, DECK_Y, 0]];
  // Bents every ~24m under the flat deck, positioned between track
  // z-positions (north yard 95/118/142/165, mains 185.5/193.5/201.5/
  // 209.5, south yard 230/253/277/300) and never on a centerline; the
  // z=198 slot inside the embankment footprint (176.5..218.5) is skipped
  // so the embankment continues beneath unbroken with no bent through it.
  const BENT_Z = [78, 102, 126, 150, 174, 222, 246, 270, 294, 318];
  const lampPoleGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.0, 6);
  const lampHeadGeo = new THREE.BoxGeometry(0.35, 0.22, 0.35);
  const colGeo = new THREE.BoxGeometry(0.5, 8.6, 0.5);
  const girderGeo = new THREE.BoxGeometry(1, 0.5, 0.5);
  const lampSpots = [], colSpots = [], girderSpots = [];
  for (const cx of VIADUCT_XS) {
    for (const [z0, z1, y0, y1] of DECK_SPANS) {
      group.add(tiltSlab(cx, z0, z1, y0 - V_DECK_T / 2, y1 - V_DECK_T / 2, V_DECK_W, V_DECK_T, deckMat));
      for (const side of [-1, 1]) {
        group.add(tiltSlab(cx + side * V_XOFF, z0, z1, y0 + V_BAL_H / 2, y1 + V_BAL_H / 2, V_BAL_T, V_BAL_H, balMat));
      }
    }
    for (let z = RAMP_N0; z <= RAMP_S1; z += 24) {
      const y = viaductY(z) + V_BAL_H;
      for (const side of [-1, 1]) lampSpots.push([cx + side * V_XOFF, y, z]);
    }
    for (const z of BENT_Z) {
      for (const side of [-1, 1]) colSpots.push([cx + side * 3, z, side]);
      girderSpots.push([cx, z]);
    }
    // 22nd St viaduct opening sign — brand-new Sept 1929 span, north end.
    if (cx === -240 && deco && deco.canvasSign) {
      const sign = deco.canvasSign('22ND ST VIADUCT — OPENED SEPT 4 1929', { width: 8 });
      sign.position.set(cx - V_XOFF - 0.2, viaductY(84) + V_BAL_H + 0.7, 84);
      sign.rotation.y = Math.PI / 2;
      group.add(sign);
    }
  }
  {
    const poleInst = new T.InstancedMesh(lampPoleGeo, ironMat, lampSpots.length);
    const headInst = new T.InstancedMesh(lampHeadGeo, glowMat, lampSpots.length);
    poleInst.userData.noShadow = true; headInst.userData.noShadow = true;
    const m4 = new T.Matrix4();
    lampSpots.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y + 1.0, z);
      poleInst.setMatrixAt(i, m4);
      m4.makeTranslation(x, y + 2.1, z);
      headInst.setMatrixAt(i, m4);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    headInst.instanceMatrix.needsUpdate = true;
    group.add(poleInst, headInst);

    const colInst = new T.InstancedMesh(colGeo, ironMat, colSpots.length);
    const girderInst = new T.InstancedMesh(girderGeo, ironMat, girderSpots.length);
    colInst.castShadow = true;
    const m4c = new T.Matrix4(), q = new T.Quaternion();
    colSpots.forEach(([x, z, side], i) => {
      q.setFromEuler(new T.Euler(0, 0, side * 0.05));
      m4c.compose(new T.Vector3(x, 4.3, z), q, new T.Vector3(1, 1, 1));
      colInst.setMatrixAt(i, m4c);
    });
    girderSpots.forEach(([gx, z], i) => {
      m4c.makeScale(6.5, 1, 1);
      m4c.setPosition(gx, 8.35, z);
      girderInst.setMatrixAt(i, m4c);
    });
    colInst.instanceMatrix.needsUpdate = true;
    girderInst.instanceMatrix.needsUpdate = true;
    group.add(colInst, girderInst);
  }

  // ------------------------------------------------------------------
  // 13. ITEM 3 — Union Station at 20th & Morris, north side of the
  // corridor. Headhouse fronts Morris at the corridor's north edge,
  // twin gabled train sheds sit behind it over the north-yard tracks
  // (open at their x-facing ends so the tracks run straight through),
  // and a small interlocking tower stands near the yard throat.
  // ------------------------------------------------------------------
  const stationBrick = (materials && materials.brick) || ironMat;
  const stationLimestone = (materials && materials.limestone) || ashlarMat;
  const stationGlass = (materials && materials.glassDay) || railMat;
  {
    // 13a. Headhouse — 3-story brick block, limestone trim bands, an
    // arched central-entrance suggestion, frieze sign, flagpole.
    const HH_W = 34, HH_D = 14, HH_H = 14, HH_CX = -56, HH_CZ = 89;
    const headhouse = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(HH_W, HH_H, HH_D), stationBrick);
    body.position.y = HH_H / 2;
    body.castShadow = true; body.receiveShadow = true;
    headhouse.add(body);
    for (const y of [0.6, HH_H * 0.55, HH_H - 0.5]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(HH_W + 0.3, 0.5, HH_D + 0.3), stationLimestone);
      band.position.y = y;
      headhouse.add(band);
    }
    const archSurround = new THREE.Mesh(new THREE.BoxGeometry(7, 6.5, 0.4), stationLimestone);
    archSurround.position.set(0, 3.25, HH_D / 2 + 0.2);
    headhouse.add(archSurround);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(3, 16, 0, Math.PI), stationGlass);
    fan.position.set(0, 6.5, HH_D / 2 + 0.42);
    headhouse.add(fan);
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(4.5, 5, 0.3), stationGlass);
    doorway.position.set(0, 2.5, HH_D / 2 + 0.4);
    headhouse.add(doorway);
    if (deco && deco.canvasSign) {
      const sign = deco.canvasSign('UNION STATION', { width: 16 });
      sign.position.set(0, HH_H - 0.5, HH_D / 2 + 0.45);
      headhouse.add(sign);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 6), ironMat);
    pole.position.set(0, HH_H + 4.5, 0);
    headhouse.add(pole);
    headhouse.position.set(HH_CX, 0, HH_CZ);
    group.add(headhouse);

    // 13b. Twin gabled train sheds — footprint 36 (x, the through-track
    // direction) x 65 (z), dark iron roof on slim columns, open at the
    // x-facing ends so the north-yard tracks run straight through.
    const SHED_Z0 = 100, SHED_Z1 = 165, SHED_LEN = SHED_Z1 - SHED_Z0, SHED_ZMID = (SHED_Z0 + SHED_Z1) / 2;
    const SHED_XS = [-92, -56];
    const shedColGeo = new THREE.CylinderGeometry(0.14, 0.14, 7, 8);
    const shedColSpots = [];
    for (const sx0 of SHED_XS) {
      const cx = sx0 + 18;
      const ridgeY = 10.5, eaveY = 7;
      const slopeLen = Math.sqrt(18 * 18 + (ridgeY - eaveY) * (ridgeY - eaveY));
      const slopeGeo = new THREE.BoxGeometry(slopeLen, 0.25, SHED_LEN);
      for (const side of [-1, 1]) {
        const slope = new THREE.Mesh(slopeGeo, ironMat);
        slope.position.set(cx + side * 9, (ridgeY + eaveY) / 2, SHED_ZMID);
        slope.rotation.z = side * Math.atan2(ridgeY - eaveY, 18);
        slope.castShadow = true;
        group.add(slope);
      }
      for (const rx of [sx0 + 1, cx, sx0 + 35]) {
        for (let z = SHED_Z0 + 5; z <= SHED_Z1 - 5; z += 15) shedColSpots.push([rx, z]);
      }
    }
    const shedColInst = new T.InstancedMesh(shedColGeo, ironMat, shedColSpots.length);
    shedColInst.castShadow = true;
    const m4s = new T.Matrix4();
    shedColSpots.forEach(([x, z], i) => {
      m4s.makeTranslation(x, 3.5, z);
      shedColInst.setMatrixAt(i, m4s);
    });
    shedColInst.instanceMatrix.needsUpdate = true;
    group.add(shedColInst);

    // Two low concrete platforms between the platform tracks, with
    // instanced lamp posts and a few baggage-cart boxes.
    const platformGeo = new THREE.BoxGeometry(24, 0.25, 5);
    const platformZs = [106, 153];
    const platformInst = new T.InstancedMesh(platformGeo, stationLimestone, platformZs.length);
    platformZs.forEach((z, i) => {
      m4s.makeTranslation(-56, 0.13, z);
      platformInst.setMatrixAt(i, m4s);
    });
    platformInst.instanceMatrix.needsUpdate = true;
    platformInst.receiveShadow = true;
    group.add(platformInst);

    const platLampGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6);
    const platLampHeadGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
    const platLampSpots = [];
    for (const z of platformZs) for (const x of [-66, -46]) platLampSpots.push([x, z]);
    const platLampInst = new T.InstancedMesh(platLampGeo, ironMat, platLampSpots.length);
    const platLampHeadInst = new T.InstancedMesh(platLampHeadGeo, glowMat, platLampSpots.length);
    platLampInst.userData.noShadow = true; platLampHeadInst.userData.noShadow = true;
    platLampSpots.forEach(([x, z], i) => {
      m4s.makeTranslation(x, 1.2, z);
      platLampInst.setMatrixAt(i, m4s);
      m4s.makeTranslation(x, 2.5, z);
      platLampHeadInst.setMatrixAt(i, m4s);
    });
    platLampInst.instanceMatrix.needsUpdate = true;
    platLampHeadInst.instanceMatrix.needsUpdate = true;
    group.add(platLampInst, platLampHeadInst);

    const cartGeo = new THREE.BoxGeometry(1.4, 0.9, 0.9);
    const cartSpots = [[-62, 104], [-50, 108], [-58, 150]];
    const cartInst = new T.InstancedMesh(cartGeo, woodMat, cartSpots.length);
    cartSpots.forEach(([x, z], i) => {
      m4s.makeTranslation(x, 0.58, z);
      cartInst.setMatrixAt(i, m4s);
    });
    cartInst.instanceMatrix.needsUpdate = true;
    cartInst.castShadow = true;
    group.add(cartInst);

    // 13c. Interlocking tower at (60, 172) — 2-story, big upper windows,
    // exterior stair suggestion.
    const towerGroup = new THREE.Group();
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 5), stationBrick);
    towerBody.position.y = 3.5;
    towerBody.castShadow = true; towerBody.receiveShadow = true;
    towerGroup.add(towerBody);
    const towerWindow = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.2), stationGlass);
    towerWindow.position.set(0, 5.2, 2.55);
    towerGroup.add(towerWindow);
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.5, 2.6), ironMat);
    stair.position.set(-3.6, 2.25, 0);
    stair.rotation.x = -0.5;
    towerGroup.add(stair);
    towerGroup.position.set(60, 0, 172);
    group.add(towerGroup);
  }

  // ------------------------------------------------------------------
  // 14. ITEM 4 — Rolling stock: one InstancedMesh family per car type,
  // parked in broken strings on the yard tracks (never on the
  // embankment mains, never in the 20th/18th street gaps, never under
  // a viaduct bent, never inside the Union Station shed/platform
  // footprint). Plus one static steam locomotive + tender on a north
  // yard track near x -300.
  // ------------------------------------------------------------------
  {
    const oxideRed = new T.Color(0x7a2e1d);
    const weatheredBrown = new T.Color(0x5a4632);
    const tarBlack = new T.Color(0x2c2b28);
    const reeferCream = new T.Color(0xd8cfa8);
    const carMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.15 });

    function forbiddenX(x) {
      if (x > GAP_20TH[0] - 4 && x < GAP_20TH[1] + 4) return true;
      if (x > GAP_18TH[0] - 4 && x < GAP_18TH[1] + 4) return true;
      for (const vx of VIADUCT_XS) if (Math.abs(x - vx) < 4) return true;
      return false;
    }
    function stationBlocked(x, z) {
      return x > -100 && x < -12 && z > 96 && z < 169;
    }

    function layStrings(zList, carLen, gap, colorList, excludeStation, clusterSize, clusterGap) {
      const spots = [];
      let colorIdx = 0;
      for (const z of zList) {
        let x = minX + 30;
        while (x < maxX - 30) {
          let placed = 0;
          while (placed < clusterSize && x < maxX - 30) {
            if (!forbiddenX(x) && !forbiddenX(x + carLen) && !(excludeStation && stationBlocked(x, z))) {
              spots.push([x + carLen / 2, z, colorList[colorIdx % colorList.length]]);
              colorIdx++;
              x += carLen + gap;
              placed++;
            } else {
              x += 6;
            }
          }
          x += clusterGap;
        }
      }
      return spots;
    }

    const YARD_Z_ALL = [...NORTH_YARD_Z, ...SOUTH_YARD_Z];
    const boxColors = [oxideRed, weatheredBrown, tarBlack, reeferCream];
    const hopperColors = [oxideRed, tarBlack];
    const tankColors = [tarBlack, weatheredBrown];

    const boxSpots = layStrings(YARD_Z_ALL, 11, 2.2, boxColors, true, 5, 18).slice(0, 28);
    const hopperSpots = layStrings(SOUTH_YARD_Z, 10, 2.0, hopperColors, false, 3, 25).slice(0, 12);
    const tankSpots = layStrings(SOUTH_YARD_Z, 10, 2.4, tankColors, false, 2, 40).slice(0, 6);

    function buildCarInstances(geo, spots, heightY) {
      if (!spots.length) return;
      const inst = new T.InstancedMesh(geo, carMat, spots.length);
      inst.castShadow = true; inst.receiveShadow = true;
      const m4 = new T.Matrix4();
      spots.forEach(([x, z, color], i) => {
        m4.makeTranslation(x, heightY, z);
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, color);
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      group.add(inst);
    }

    buildCarInstances(new THREE.BoxGeometry(11, 3.2, 3.4), boxSpots, 2.54);
    buildCarInstances(new THREE.BoxGeometry(10, 3, 2.9), hopperSpots, 2.44);
    const tankGeo = new THREE.CylinderGeometry(1.5, 1.5, 10, 12);
    tankGeo.rotateZ(Math.PI / 2);
    buildCarInstances(tankGeo, tankSpots, 2.44);

    // Static steam locomotive + tender, north yard, near x -300.
    const loco = new THREE.Group();
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 9, 14), ironMat);
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(0, 2.3, 0);
    boiler.castShadow = true;
    loco.add(boiler);
    const smokebox = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 1.4, 14), ironMat);
    smokebox.rotation.z = Math.PI / 2;
    smokebox.position.set(-5.2, 2.3, 0);
    loco.add(smokebox);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 3), woodMat);
    cab.position.set(4.5, 3.1, 0);
    loco.add(cab);
    const driverGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.4, 16);
    for (const dx of [-1.5, 1, 3.2]) {
      for (const side of [-1, 1]) {
        const driver = new THREE.Mesh(driverGeo, ironMat);
        driver.rotation.x = Math.PI / 2;
        driver.position.set(dx, 1.0, side * 1.9);
        loco.add(driver);
      }
    }
    const tender = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 3), ironMat);
    tender.position.set(9.5, 2.0, 0);
    tender.castShadow = true;
    loco.add(tender);
    loco.position.set(-300, 0.44, NORTH_YARD_Z[0]);
    group.add(loco);
  }

  scene.add(group);
}
