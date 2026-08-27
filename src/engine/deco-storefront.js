/**
 * deco-storefront.js - storefrontBand(): street-level ground-floor
 * storefront band adopted inside setbackTower and pilasterFacade so every
 * tower/facade in the city gets real shopfronts at pedestrian eye level
 * instead of bare wall or a plain window row. Built as a small fixed set
 * of merged (not instanced) meshes - one per material - so draw-call cost
 * stays flat regardless of bay count: masonry piers + bulkhead panels in
 * one mesh, bronze mullions/frames in another, all glass (display panes,
 * sidelights, transom lights) in a third, dark recessed door leaves in a
 * fourth, and striped canvas awnings in a fifth (only when opts.awnings).
 *
 * Local coordinate convention matches deco-windows.js: the Group's origin
 * sits flush with the wall's outer face (local z = 0), and every part
 * projects forward from there (z >= 0) toward +Z - piers reach out to
 * z ~0.5, glass sits recessed around z ~0.32-0.4, awnings cantilever out
 * to z ~1.4. Base of the band is at y = 0.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { materials } from './materials.js';
import { rand, mergeGeometries, awningTexture } from './deco-shared.js';

let _awningMat = null;
function awningMaterial() {
  if (_awningMat) return _awningMat;
  _awningMat = new THREE.MeshStandardMaterial({
    map: awningTexture(), roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide,
  });
  return _awningMat;
}

/**
 * storefrontBand - street-level band of display windows, entries and
 * awnings between masonry piers.
 * @param {object} opts
 * @param {number} opts.width total band width (m) - pass the tower/facade base width
 * @param {number} [opts.bays] bay count across the width (default: ~one bay per 4m)
 * @param {number} [opts.height=4.6] band height (m), ground-floor clear height
 * @param {THREE.Material} [opts.material=materials.limestone] pier/bulkhead masonry
 * @param {boolean} [opts.awnings=true] add striped canvas awnings, ~half seeded to droop
 * @param {number} [opts.seed] deterministic seed for door placement + awning variation
 * @returns {THREE.Group} origin at bottom-center, wall face at local z=0, opens toward +Z
 */
export function storefrontBand(opts = {}) {
  const {
    width = 12,
    bays = Math.max(2, Math.round(width / 4)),
    height = 4.6,
    material = materials.limestone,
    awnings = true,
    seed = Math.round(width * 97 + bays * 31 + height * 7) || 1,
  } = opts;

  const g = new THREE.Group();
  const rng = rand(seed);
  const nBays = Math.max(1, Math.round(bays));
  const bayW = width / nBays;
  const pierW = Math.min(0.6, bayW * 0.18);
  const bulkH = height * 0.22;
  const transomH = height * 0.16;
  const glassH = Math.max(0.6, height - bulkH - transomH - 0.12);
  const doorW = Math.min(1.6, bayW * 0.55);

  // Entry doors every 2-3 bays (seeded), guaranteed at least one.
  const doorBays = new Set();
  {
    let i = Math.floor(rng() * 2);
    while (i < nBays) { doorBays.add(i); i += 2 + Math.floor(rng() * 2); }
  }
  if (doorBays.size === 0) doorBays.add(Math.floor(nBays / 2));

  const masonryParts = [];
  const bronzeParts = [];
  const glassParts = [];
  const doorParts = [];
  const awningParts = [];

  // Piers at every bay boundary - full band height, projecting to z=0.5.
  for (let i = 0; i <= nBays; i++) {
    const x = -width / 2 + i * bayW;
    const geo = new THREE.BoxGeometry(pierW, height, 0.5);
    geo.translate(x, height / 2, 0.25);
    masonryParts.push(geo);
  }

  for (let i = 0; i < nBays; i++) {
    const x = -width / 2 + (i + 0.5) * bayW;
    const innerW = Math.max(0.4, bayW - pierW * 1.4);

    // Transom light strip near the top of every bay.
    const transomGeo = new THREE.PlaneGeometry(innerW, Math.max(0.2, transomH - 0.06));
    transomGeo.translate(x, height - transomH / 2 - 0.04, 0.4);
    glassParts.push(transomGeo);
    const transomFrame = new THREE.BoxGeometry(innerW + 0.08, transomH - 0.02, 0.05);
    transomFrame.translate(x, height - transomH / 2 - 0.04, 0.42);
    bronzeParts.push(transomFrame);

    if (doorBays.has(i)) {
      // Recessed entry: door leaf + narrow sidelights + bronze frame.
      const doorH = height * 0.78;
      const dw = Math.min(doorW, innerW * 0.5);
      const doorGeo = new THREE.BoxGeometry(dw, doorH, 0.1);
      doorGeo.translate(x, doorH / 2, 0.16);
      doorParts.push(doorGeo);
      const sideW = Math.max(0.2, (innerW - dw) / 2);
      for (const sx of [-1, 1]) {
        const sideGeo = new THREE.PlaneGeometry(sideW, doorH * 0.82);
        sideGeo.translate(x + sx * (dw / 2 + sideW / 2), doorH * 0.42, 0.28);
        glassParts.push(sideGeo);
      }
      for (const sx of [-1, 1]) {
        const jamb = new THREE.BoxGeometry(0.1, doorH + 0.14, 0.32);
        jamb.translate(x + sx * (dw / 2 + 0.05), doorH / 2, 0.2);
        bronzeParts.push(jamb);
      }
      const lintel = new THREE.BoxGeometry(dw + 0.3, 0.1, 0.32);
      lintel.translate(x, doorH + 0.08, 0.2);
      bronzeParts.push(lintel);
    } else {
      // Bulkhead kick panel + large display window behind bronze mullions.
      const bulkGeo = new THREE.BoxGeometry(innerW, bulkH, 0.42);
      bulkGeo.translate(x, bulkH / 2, 0.21);
      masonryParts.push(bulkGeo);

      const glassGeo = new THREE.PlaneGeometry(innerW - 0.1, glassH);
      glassGeo.translate(x, bulkH + glassH / 2 + 0.02, 0.35);
      glassParts.push(glassGeo);

      const mullion = new THREE.BoxGeometry(0.06, glassH + 0.06, 0.05);
      mullion.translate(x, bulkH + glassH / 2 + 0.02, 0.38);
      bronzeParts.push(mullion);
      const sill = new THREE.BoxGeometry(innerW + 0.14, 0.08, 0.3);
      sill.translate(x, bulkH + 0.04, 0.4);
      bronzeParts.push(sill);
    }

    // Striped canvas awning over every bay's transom, ~half seeded to droop.
    if (awnings) {
      const droop = rng() < 0.5;
      const angle = droop ? -0.32 : -0.14;
      const yOff = height - transomH + (droop ? -0.1 : 0.02);
      const panel = new THREE.BoxGeometry(bayW - pierW * 0.5, 0.06, 1.3);
      panel.translate(0, 0, 0.65);
      panel.rotateX(angle);
      panel.translate(x, yOff, 0.48);
      awningParts.push(panel);
      const valance = new THREE.BoxGeometry(bayW - pierW * 0.5, 0.22, 0.04);
      valance.translate(0, -0.11, 1.28);
      valance.rotateX(angle);
      valance.translate(x, yOff, 0.48);
      awningParts.push(valance);
    }
  }

  g.add(new THREE.Mesh(mergeGeometries(masonryParts), material));
  g.add(new THREE.Mesh(mergeGeometries(bronzeParts), materials.bronze));
  g.add(new THREE.Mesh(mergeGeometries(glassParts), materials.glassDay));
  g.add(new THREE.Mesh(mergeGeometries(doorParts), materials.steelDark));
  if (awnings && awningParts.length) {
    const awningMesh = new THREE.Mesh(mergeGeometries(awningParts), awningMaterial());
    awningMesh.userData.noShadow = true;
    g.add(awningMesh);
  }

  g.userData.storefrontBays = nBays;
  return g;
}
