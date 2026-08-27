/**
 * deco-windows.js - windowGrid v2.
 * windowGrid(opts) keeps the ORIGINAL required fields (rows, cols,
 * spacingX, spacingY, width, height, material) working exactly as before;
 * two additive options (seed, litFraction) tune the new per-instance night
 * variation. Each window is now a real punched-opening unit: a dark
 * reveal frame projecting out from the wall face, a glass pane recessed
 * ~0.21m behind the reveal's outer lip, a projecting sill below and
 * lintel above, and thin mullions - built as 3 InstancedMeshes sharing
 * the grid's per-window transforms, so draw calls stay flat regardless of
 * window count.
 *
 * IMPORTANT coordinate convention: callers attach the returned Group's
 * origin FLUSH with the wall's outer face (z=0 local = the wall surface),
 * not floating in front of it. Every part of the unit lives at local
 * z >= 0.02 (a hair proud of the wall) so nothing is ever placed behind
 * the solid tier-box's own face, where it would be fully occluded/
 * z-fighting and invisible - the engine has no CSG/boolean geometry to
 * cut real openings, so "recessed" is built by projecting the reveal
 * frame out from the wall and setting the glass back within that frame's
 * own depth (0.21m behind the frame's outer lip), which reads correctly
 * as a punched masonry opening from every camera angle.
 *
 * At night (material === materials.glassNight), ~55-70% of instances glow
 * warm via instanceColor and the rest stay dark - no more uniform grids.
 * @returns {THREE.Group} origin at grid center, wall face at local z=0, opens toward +Z
 */
import * as THREE from '../../vendor/three.module.min.js';
import { materials } from './materials.js';
import { rand, mergeGeometries } from './deco-shared.js';

export function windowGrid(opts) {
  const { rows, cols, spacingX, spacingY,
          width = 1.6, height = 2.2, material = materials.glassDay,
          seed = rows * 977 + cols * 313 + Math.round(width * 100),
          litFraction = 0.62 } = opts;
  const count = Math.max(1, rows * cols);
  const group = new THREE.Group();

  // Depth budget (all >=0, in front of the wall face at local z=0):
  //   0.02 reveal back (touches wall)  ->  0.27 reveal outer lip (proud 0.25m)
  //   glass sits at 0.06 (0.21m behind the outer lip = the "25cm recess")
  //   mullions run from glass to the outer lip; sill/lintel project past it.
  const REVEAL_BACK = 0.02, REVEAL_FRONT = 0.27, GLASS_Z = 0.06;

  // --- Merged dark reveal frame + two mullions, one draw call. ---
  const revealGeo = new THREE.BoxGeometry(width + 0.16, height + 0.16, REVEAL_FRONT - REVEAL_BACK);
  revealGeo.translate(0, 0, (REVEAL_FRONT + REVEAL_BACK) / 2);
  const mullionL = new THREE.BoxGeometry(0.06, height, 0.04);
  mullionL.translate(-width * 0.26, 0, (GLASS_Z + REVEAL_FRONT) / 2);
  const mullionR = new THREE.BoxGeometry(0.06, height, 0.04);
  mullionR.translate(width * 0.26, 0, (GLASS_Z + REVEAL_FRONT) / 2);
  const trimUnitGeo = mergeGeometries([revealGeo, mullionL, mullionR]);
  const trimMesh = new THREE.InstancedMesh(trimUnitGeo, materials.steelDark, count);

  // --- Merged projecting sill + lintel (past the reveal's outer lip). ---
  const sillGeo = new THREE.BoxGeometry(width + 0.42, 0.12, 0.34);
  sillGeo.translate(0, -height / 2 - 0.07, REVEAL_FRONT + 0.05);
  const lintelGeo = new THREE.BoxGeometry(width + 0.32, 0.14, 0.28);
  lintelGeo.translate(0, height / 2 + 0.08, REVEAL_FRONT + 0.03);
  const ledgeUnitGeo = mergeGeometries([sillGeo, lintelGeo]);
  const ledgeMesh = new THREE.InstancedMesh(ledgeUnitGeo, materials.terracotta, count);

  // --- Glass pane, recessed within the reveal, per-instance lit color. ---
  const glassGeo = new THREE.PlaneGeometry(width, height);
  const glassMesh = new THREE.InstancedMesh(glassGeo, material, count);
  const colorArray = new Float32Array(count * 3).fill(1);
  glassMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);

  const m = new THREE.Matrix4();
  const rng = rand(seed);
  const isNight = material === materials.glassNight;
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * spacingX;
      const y = (r - (rows - 1) / 2) * spacingY;
      m.makeTranslation(x, y, 0);
      trimMesh.setMatrixAt(n, m);
      ledgeMesh.setMatrixAt(n, m);
      m.makeTranslation(x, y, GLASS_Z);
      glassMesh.setMatrixAt(n, m);
      if (isNight) {
        const lit = rng() < litFraction;
        if (lit) {
          const warm = 0.95 + rng() * 0.4;
          glassMesh.instanceColor.setXYZ(n, warm, warm * 0.82, warm * 0.55);
        } else {
          glassMesh.instanceColor.setXYZ(n, 0.12, 0.12, 0.14);
        }
      }
      n++;
    }
  }
  trimMesh.instanceMatrix.needsUpdate = true;
  ledgeMesh.instanceMatrix.needsUpdate = true;
  glassMesh.instanceMatrix.needsUpdate = true;
  glassMesh.instanceColor.needsUpdate = true;
  group.add(trimMesh, ledgeMesh, glassMesh);
  group.userData.windowCount = count;
  return group;
}
