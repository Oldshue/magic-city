/**
 * materials.js — the shared material palette of Magic City 1929.
 *
 * Every district builds from these named materials so lighting, tone mapping,
 * and palette stay coherent across the city. All are MeshStandardMaterial
 * (or MeshBasicMaterial for pure glow) tuned for warm 1929 limestone daylight
 * and emissive night life.
 *
 * Procedural texture factory: small canvas-generated, tileable (~256-512px)
 * textures — no external assets — give masonry and pavement real surface
 * detail (brick courses + mortar, ashlar joints, glazed terracotta bands,
 * aggregate asphalt with wear tracks, concrete slab joints) with matching
 * bump maps.
 *
 * CRITICAL — texel density consistency: BoxGeometry gives every face 0..1
 * UVs regardless of the box's world size, so naive texturing would tile a
 * huge facade with one giant stretched brick. applyWorldMapping() patches a
 * material's shader (onBeforeCompile) to sample color/bump/roughness maps
 * from WORLD-SPACE position via a box projection (dominant-axis planar
 * mapping picked per-fragment from the world normal) instead of the mesh's
 * own UV attribute, so a 2m brick pier and a 40m tower wall show bricks at
 * the same real-world scale with zero district-side changes.
 *
 * FIX (Graphics Finisher pass): the draft's custom bump-perturbation term
 * used a flat `bumpScale * 24.0` multiplier against raw screen-space
 * derivatives of the *height texture value* (not the built-in, texel-size-
 * normalized `dHdxy_fwd()` three.js itself uses). At hard mortar/brick
 * edges those derivatives spike, and the huge multiplier turned that spike
 * into a perturbation vector many times longer than the unit normal itself
 * — so `normalize(normal + mcPerturb)` was effectively replacing the real
 * surface normal with near-random per-texel noise. Lambertian shading of a
 * randomized normal field averages far darker than flat shading even in
 * full sun, which is exactly the reported "daytime facades read charcoal
 * even on sun-facing sides" symptom. Fixed by cutting the multiplier by
 * ~16x (24.0 -> 1.5) and lowering the default bumpScale values so surface
 * relief still reads (mortar joints, ashlar joints, terracotta reveals)
 * without overwhelming the base lighting.
 *
 * FIX (texel scale, Graphics Finisher pass): brick/limestone/asphalt/
 * sidewalk world-mapping scale constants are the UV-per-meter density
 * (`worldMeters * scale` -> UV, then RepeatWrapping tiles every 1.0 UV).
 *
 * FIX (texel scale, Storefront Director close-up audit): the values above
 * (brick scale 1.3, limestone scale 0.42) were tuned against small trim
 * pieces and read far too fine at a true street-level 5m tower-base
 * close-up — brick courses came out ~0.077m (a hair's width of relief)
 * and limestone ashlar blocks ~0.6m x 0.4m, both a full material generation
 * finer than the program's stated targets (brick courses ~0.25m tall;
 * limestone blocks ~0.6m x 1.2m). Retuned so brick's 10-course/tile texture
 * spans 2.5m (scale 0.4 -> 0.25m/course) and limestone's 6-row/tile texture
 * spans 3.6m (scale 0.2778 -> 0.6m-tall rows; alternating 3/4 blocks per
 * row read ~1.2m/~0.9m wide), matching real pressed-brick and large-block
 * civic ashlar coursing at pedestrian viewing distance.
 *
 * Export: `materials` object with the named entries required by the contract:
 * limestone, brick, terracotta, bronze, steelDark, glassDay, glassNight,
 * marquee, furnaceGlow, asphalt, sidewalk, rail, foliage. Every key keeps its
 * original name — only appearance is upgraded.
 */
import * as THREE from 'three';

const std = (opts) => new THREE.MeshStandardMaterial(opts);
const basic = (color) => new THREE.MeshBasicMaterial({ color });

// ---------------------------------------------------------------------
// Canvas texture factory helpers
// ---------------------------------------------------------------------
function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}
function toTexture(canvas, { srgb = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
// Small deterministic PRNG (mulberry32) — stable texture noise across reloads.
function rand(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Brick: red pressed brick with courses, mortar joints, tonal variation --
function makeBrickTextures(size = 256) {
  const rng = rand(1001);
  const color = makeCanvas(size);
  const bump = makeCanvas(size);
  const cx = color.getContext('2d');
  const bx = bump.getContext('2d');
  const courseH = size / 10; // 10 courses
  const brickW = size / 5; // 5 bricks/course, alternating half-offset
  cx.fillStyle = '#4a2016'; cx.fillRect(0, 0, size, size); // mortar base
  bx.fillStyle = '#606060'; bx.fillRect(0, 0, size, size);
  let row = 0;
  for (let y = 0; y < size; y += courseH) {
    const offset = (row % 2) * (brickW / 2);
    for (let x = -brickW; x < size + brickW; x += brickW) {
      const bxp = x + offset + 1.4;
      const byp = y + 1.4;
      const bw = brickW - 2.8, bh = courseH - 2.8;
      const tone = 0.78 + rng() * 0.4;
      const r = Math.min(255, Math.floor(158 * tone));
      const g = Math.floor(60 * tone);
      const b = Math.floor(42 * tone);
      cx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      cx.fillRect(bxp, byp, bw, bh);
      const bt = Math.floor(150 + rng() * 70);
      bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
      bx.fillRect(bxp, byp, bw, bh);
    }
    row++;
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// --- Limestone ashlar: cream block joints with subtle banding ----------
function makeLimestoneTextures(size = 256) {
  const rng = rand(2002);
  const color = makeCanvas(size);
  const bump = makeCanvas(size);
  const cx = color.getContext('2d');
  const bx = bump.getContext('2d');
  const rowH = size / 6; // 6 ashlar courses
  cx.fillStyle = '#8f8368'; cx.fillRect(0, 0, size, size); // joint base
  bx.fillStyle = '#707070'; bx.fillRect(0, 0, size, size);
  let row = 0;
  for (let y = 0; y < size; y += rowH) {
    const blocks = 3 + (row % 2);
    const blockW = size / blocks;
    for (let i = 0; i < blocks; i++) {
      const bxp = i * blockW + 1.6;
      const byp = y + 1.6;
      const bw = blockW - 3.2, bh = rowH - 3.2;
      const band = 0.9 + 0.06 * Math.sin(row * 1.7);
      const tone = (0.86 + rng() * 0.16) * band;
      const r = Math.floor(218 * tone), g = Math.floor(200 * tone), b = Math.floor(168 * tone);
      cx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      cx.fillRect(bxp, byp, bw, bh);
      const bt = Math.floor(160 + rng() * 40);
      bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
      bx.fillRect(bxp, byp, bw, bh);
    }
    row++;
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// --- Glazed terracotta: polychrome block bands with a glossy highlight --
function makeTerracottaTextures(size = 256) {
  const rng = rand(3003);
  const color = makeCanvas(size);
  const bump = makeCanvas(size);
  const cx = color.getContext('2d');
  const bx = bump.getContext('2d');
  const rowH = size / 8;
  const palette = [[0xc8, 0xb4, 0x8c], [0x8f, 0xa8, 0x84], [0xd8, 0xc8, 0x98]];
  cx.fillStyle = '#5a4a34'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#686868'; bx.fillRect(0, 0, size, size);
  let row = 0;
  for (let y = 0; y < size; y += rowH) {
    const blocks = 4;
    const blockW = size / blocks;
    for (let i = 0; i < blocks; i++) {
      const bxp = i * blockW + 1.4;
      const byp = y + 1.4;
      const bw = blockW - 2.8, bh = rowH - 2.8;
      const p = palette[(row + i) % palette.length];
      const tone = 0.88 + rng() * 0.2;
      const r = Math.floor(p[0] * tone), g = Math.floor(p[1] * tone), b = Math.floor(p[2] * tone);
      cx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      cx.fillRect(bxp, byp, bw, bh);
      // glossy highlight sliver near the top edge of each block
      cx.fillStyle = 'rgba(255,255,255,0.18)';
      cx.fillRect(bxp, byp, bw, Math.max(1, bh * 0.12));
      const bt = Math.floor(200 + rng() * 30);
      bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
      bx.fillRect(bxp, byp, bw, bh);
    }
    row++;
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// --- Asphalt: aggregate speckle noise, faint wear tracks, patch stains --
function makeAsphaltTextures(size = 256) {
  const rng = rand(4004);
  const color = makeCanvas(size);
  const bump = makeCanvas(size);
  const cx = color.getContext('2d');
  const bx = bump.getContext('2d');
  cx.fillStyle = '#232426'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#606060'; bx.fillRect(0, 0, size, size);
  // aggregate speckle
  for (let i = 0; i < size * size * 0.12; i++) {
    const x = rng() * size, y = rng() * size;
    const g = Math.floor(30 + rng() * 60);
    cx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',0.85)';
    cx.fillRect(x, y, 1, 1);
    const bt = Math.floor(90 + rng() * 90);
    bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
    bx.fillRect(x, y, 1, 1);
  }
  // faint tire wear tracks — two lighter horizontal bands
  for (const cy of [size * 0.32, size * 0.68]) {
    cx.fillStyle = 'rgba(70,70,72,0.25)';
    cx.fillRect(0, cy - size * 0.06, size, size * 0.12);
  }
  // patch stains — a couple of irregular darker blobs
  for (let i = 0; i < 3; i++) {
    const x = rng() * size, y = rng() * size, r = size * (0.06 + rng() * 0.08);
    cx.fillStyle = 'rgba(18,17,16,0.35)';
    cx.beginPath(); cx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2); cx.fill();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// --- Sidewalk: concrete slabs with expansion joints and light wear -----
function makeSidewalkTextures(size = 256) {
  const rng = rand(5005);
  const color = makeCanvas(size);
  const bump = makeCanvas(size);
  const cx = color.getContext('2d');
  const bx = bump.getContext('2d');
  cx.fillStyle = '#b0a690'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.05; i++) {
    const x = rng() * size, y = rng() * size;
    const g = 150 + Math.floor(rng() * 40 - 20);
    cx.fillStyle = 'rgba(' + g + ',' + (g - 6) + ',' + (g - 16) + ',0.5)';
    cx.fillRect(x, y, 1.2, 1.2);
  }
  cx.strokeStyle = 'rgba(60,56,48,0.65)';
  cx.lineWidth = 2.5;
  bx.strokeStyle = 'rgba(0,0,0,0.9)';
  bx.lineWidth = 2.5;
  for (const t of [0, 0.5, 1]) {
    cx.beginPath(); cx.moveTo(t * size, 0); cx.lineTo(t * size, size); cx.stroke();
    cx.beginPath(); cx.moveTo(0, t * size); cx.lineTo(size, t * size); cx.stroke();
    bx.beginPath(); bx.moveTo(t * size, 0); bx.lineTo(t * size, size); bx.stroke();
    bx.beginPath(); bx.moveTo(0, t * size); bx.lineTo(size, t * size); bx.stroke();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

const brickTex = makeBrickTextures();
const limestoneTex = makeLimestoneTextures();
const terracottaTex = makeTerracottaTextures();
const asphaltTex = makeAsphaltTextures();
const sidewalkTex = makeSidewalkTextures();

// ---------------------------------------------------------------------
// World-space box-projected mapping (see module doc above).
// ---------------------------------------------------------------------
function applyWorldMapping(material, opts) {
  const scale = (opts && opts.scale) || 0.2;
  material.onBeforeCompile = (shader) => {
    const vHelpers = '\nvarying vec3 mcWorldPos;\nvarying vec3 mcWorldNormal;\n';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + vHelpers)
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nmcWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nmcWorldNormal = normalize(mat3(modelMatrix) * objectNormal);');

    const fHelpers = '\nvarying vec3 mcWorldPos;\nvarying vec3 mcWorldNormal;\nvec2 mcBoxUv(vec3 p, vec3 n) {\n  vec3 an = abs(n);\n  if (an.x >= an.y && an.x >= an.z) return p.zy;\n  else if (an.y >= an.x && an.y >= an.z) return p.xz;\n  else return p.xy;\n}\n';
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>' + fHelpers);

    const scaleStr = scale.toFixed(5);
    if (shader.fragmentShader.indexOf('#include <map_fragment>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        '\n#ifdef USE_MAP\n  vec4 mcSampled = texture2D(map, mcBoxUv(mcWorldPos, mcWorldNormal) * ' + scaleStr + ');\n  diffuseColor *= mcSampled;\n#endif\n');
    }
    if (shader.fragmentShader.indexOf('#include <bumpmap_fragment>') !== -1) {
      // FIX: the multiplier here was 24.0 in the draft, which turned normal
      // screen-space derivative spikes at hard mortar/brick edges into
      // perturbation vectors many times longer than the unit normal itself,
      // effectively randomizing surface normals and reading as near-black
      // even in full sun. 1.5 keeps visible relief without breaking lighting.
      shader.fragmentShader = shader.fragmentShader.replace('#include <bumpmap_fragment>',
        '\n#ifdef USE_BUMPMAP\n  {\n    float mcH = texture2D(bumpMap, mcBoxUv(mcWorldPos, mcWorldNormal) * ' + scaleStr + ').x;\n    float mcDx = clamp(dFdx(mcH), -0.35, 0.35);\n    float mcDy = clamp(dFdy(mcH), -0.35, 0.35);\n    vec3 mcTx = normalize(dFdx(mcWorldPos));\n    vec3 mcTy = normalize(dFdy(mcWorldPos));\n    vec3 mcPerturb = (cross(mcTy, normal) * mcDx - cross(mcTx, normal) * mcDy) * bumpScale * 1.5;\n    normal = normalize(normal + mcPerturb);\n  }\n#endif\n');
    }
    if (shader.fragmentShader.indexOf('#include <roughnessmap_fragment>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '\nfloat roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n  roughnessFactor *= texture2D(roughnessMap, mcBoxUv(mcWorldPos, mcWorldNormal) * ' + scaleStr + ').g;\n#endif\n');
    }
  };
  material.customProgramCacheKey = () => 'mcWorldMap:' + scale;
}

export const materials = {
  /** Warm cream limestone — principal facade stone of the era. */
  limestone: std({ color: 0xffffff, map: limestoneTex.map, bumpMap: limestoneTex.bump, bumpScale: 0.4, roughness: 0.88, metalness: 0.0 }),

  /** Deep red pressed brick for warehouse and secondary masses. */
  brick: std({ color: 0xffffff, map: brickTex.map, bumpMap: brickTex.bump, bumpScale: 0.5, roughness: 0.92, metalness: 0.02 }),

  /** Glazed polychrome terracotta ornament — deco greens, creams, golds. */
  terracotta: std({ color: 0xffffff, map: terracottaTex.map, bumpMap: terracottaTex.bump, bumpScale: 0.3, roughness: 0.35, metalness: 0.08 }),

  /** Patinated bronze — doors, trim, spandrels, elevator grilles. */
  bronze: std({ color: 0x6e5426, roughness: 0.32, metalness: 0.88 }),

  /** Near-black structural steel / ironwork. */
  steelDark: std({ color: 0x2a2d33, roughness: 0.45, metalness: 0.8 }),

  /** Daytime glass — dark reflective panes, tuned metal/rough (no envMap dependency). */
  glassDay: std({ color: 0x1b232b, roughness: 0.08, metalness: 0.55 }),

  /** Night glass — emissive warm glazing glow, intensity driven by sky.js day phase
   * (see setGlassNightGlow below) instead of a fixed always-on value. */
  glassNight: std({ color: 0x1a1f26, roughness: 0.2, metalness: 0.4,
                    emissive: 0xffb45e, emissiveIntensity: 0.0 }),

  /** Marquee / sign face glow (basic, ignores lights, always lit). */
  marquee: basic(0xffe6b0),

  /** Furnace district bloom — molten orange glow on southern horizon. */
  furnaceGlow: basic(0xff5a1e),

  /** Street asphalt ribbon. */
  asphalt: std({ color: 0xffffff, map: asphaltTex.map, bumpMap: asphaltTex.bump, bumpScale: 0.4, roughness: 0.95, metalness: 0.0 }),

  /** Sidewalk paving — poured concrete slabs with expansion joints. */
  sidewalk: std({ color: 0xffffff, map: sidewalkTex.map, bumpMap: sidewalkTex.bump, bumpScale: 0.3, roughness: 0.9, metalness: 0.0 }),

  /** Streetcar rail — polished steel catching the sun. */
  rail: std({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 }),

  /** Park foliage — muted 1929 park green. */
  foliage: std({ color: 0x3f5c34, roughness: 0.9, metalness: 0.0 }),
};

// Texel-density tuning: `scale` is UV units per world meter; texture tiles
// every 1.0 UV, so a tile spans (1/scale) meters. Brick's texture is 10
// courses per tile: scale=0.4 -> tile 2.5m -> 0.25m per course, matching
// the program's stated pressed-brick target. Limestone's texture is 6
// ashlar rows per tile: scale=0.2778 -> tile 3.6m -> 0.6m per row, with
// alternating 3/4-block rows reading ~1.2m/~0.9m wide blocks, matching the
// program's stated large-block civic-ashlar target. Terracotta/asphalt/
// sidewalk tuned to plausible street-level grain (unchanged from the prior
// Graphics Finisher pass; not part of this audit's stated defects).
applyWorldMapping(materials.limestone, { scale: 0.2778 });
applyWorldMapping(materials.brick, { scale: 0.4 });
applyWorldMapping(materials.terracotta, { scale: 0.55 });
applyWorldMapping(materials.asphalt, { scale: 0.4 });
applyWorldMapping(materials.sidewalk, { scale: 0.5 });

/**
 * setGlassNightGlow — drives glassNight's emissive intensity from the sky's
 * day-phase cycle (called every frame from sky.js update()). 0 = fully dark
 * daytime glazing, 1 = full night glow (peak emissive 2.6, matching the
 * original always-on value).
 * @param {number} factor 0..1
 */
export function setGlassNightGlow(factor) {
  materials.glassNight.emissiveIntensity = Math.max(0, Math.min(1, factor)) * 2.6;
}
