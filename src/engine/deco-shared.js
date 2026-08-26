/**
 * deco-shared.js - small utilities shared by the deco-*.js helper modules
 * that together implement src/engine/deco.js's public API. Split out
 * purely to keep each file small; deco.js re-exports the public surface.
 */
import * as THREE from 'three';
import { materials } from './materials.js';

/** Deterministic PRNG (mulberry32) for stable per-instance variation. */
export function rand(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * mergeGeometries - concatenate several BufferGeometries (already baked
 * into place via .translate()/.rotate*()) into one indexed geometry, so a
 * cluster of small parts (window trim, lamp post+arm, etc.) draws as one
 * InstancedMesh instead of one call per part. Position/normal/uv only.
 */
export function mergeGeometries(geoms) {
  let vertCount = 0, idxCount = 0;
  for (const g of geoms) { vertCount += g.attributes.position.count; idxCount += g.index.count; }
  const position = new Float32Array(vertCount * 3);
  const normal = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const IndexArr = idxCount > 65535 ? Uint32Array : Uint16Array;
  const index = new IndexArr(idxCount);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    position.set(g.attributes.position.array, vOff * 3);
    normal.set(g.attributes.normal.array, vOff * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) index[iOff + i] = idx[i] + vOff;
    vOff += g.attributes.position.count; iOff += idx.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

// Warm radial-glow disc texture (lamp pavement pools).
let _glowDiscTexture = null;
export function glowDiscTexture() {
  if (_glowDiscTexture) return _glowDiscTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,214,150,0.9)');
  g.addColorStop(0.5, 'rgba(255,190,110,0.35)');
  g.addColorStop(1.0, 'rgba(255,180,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _glowDiscTexture = new THREE.CanvasTexture(c);
  _glowDiscTexture.colorSpace = THREE.SRGBColorSpace;
  return _glowDiscTexture;
}

// Striped canvas awning texture (storefront awnings).
let _awningTexture = null;
export function awningTexture() {
  if (_awningTexture) return _awningTexture;
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const stripeW = w / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#c94f3f' : '#e8dcc0';
    ctx.fillRect(i * stripeW, 0, stripeW, h);
  }
  _awningTexture = new THREE.CanvasTexture(c);
  _awningTexture.colorSpace = THREE.SRGBColorSpace;
  _awningTexture.wrapS = THREE.RepeatWrapping;
  return _awningTexture;
}

// Enable optional per-instance color modulation feeding glassNight's
// emissive (used by windowGrid's lit/dark instance variation) without
// editing materials.js. USE_INSTANCING_COLOR's default chunk already
// multiplies diffuseColor by vColor; this adds the emissive term too.
if (!materials.glassNight.userData.mcInstancedEmissivePatched) {
  materials.glassNight.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif\n'
    );
  };
  materials.glassNight.needsUpdate = true;
  materials.glassNight.userData.mcInstancedEmissivePatched = true;
}
