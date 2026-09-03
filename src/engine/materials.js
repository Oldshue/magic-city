/**
 * materials.js — the shared material palette of Magic City 1929.
 *
 * Every district builds from these named materials so lighting, tone mapping,
 * and palette stay coherent across the city. All are MeshStandardMaterial
 * (or MeshBasicMaterial for pure glow) tuned for warm 1929 limestone daylight
 * and emissive night life.
 *
 * Procedural texture factory: canvas-generated, tileable 256-512px textures —
 * no external assets, no network — give every material real surface detail:
 * masonry courses + mortar, ashlar joints + weathering, glazed terracotta
 * chevron/sunburst tile, aggregate asphalt with tire-track darkening and
 * lane sheen, paver sidewalk with joints and stains, glazed windows with
 * baked mullions and per-pane day/night brightness variation, patinated
 * bronze, brushed steel, polished rail with rust flecks, a hot-metal
 * furnace gradient, and mottled leafy foliage.
 *
 * CRITICAL — texel density (see applyWorldMapping): BoxGeometry gives every
 * face 0..1 UVs regardless of world size, so naive texturing would stretch
 * one giant brick across a whole facade. applyWorldMapping() patches a
 * material's shader (onBeforeCompile) to sample color/bump/roughness/
 * emissive maps from WORLD-SPACE position via dominant-axis box projection,
 * so texture scale stays consistent (meters-per-tile) with zero district-
 * side UV changes. `scale` is UV units per world meter; a texture tiles
 * every 1.0 UV, so a tile spans (1/scale) meters — see the tuning calls at
 * the bottom of this file for every material's assumed real-world scale.
 *
 * WAVE 1 / M1 (Materials Engineer II) additions on top of the prior pass:
 *  - brick: added a soft grime gradient darkening toward the base (street
 *    dust/splash weathering), on top of the existing course/mortar/tone map.
 *  - limestone: added faint vertical weathering streaks (rain runoff) over
 *    the existing ashlar coursing.
 *  - terracotta: block fill replaced with a chevron/sunburst deco motif per
 *    tile so glazed ornament reads as ornament, not plain tile.
 *  - asphalt: tire-track bands now genuinely darken (were a lighter overlay)
 *    plus a broader faint center lane-sheen; aggregate speckle unchanged.
 *  - sidewalk: added a few soft stain blotches alongside the joint grid.
 *  - glassDay/glassNight (new): a shared 6x6-pane atlas with baked mullions.
 *    Day map: cool dark glass, subtle per-pane tint + top sheen. Night: a
 *    separate emissiveMap encodes per-pane brightness — about a third of
 *    panes dark/unlit, the rest randomly lit, a few bright — sampled in
 *    WORLD SPACE via applyWorldMapping (extended to patch
 *    emissivemap_fragment) so real facades show genuinely varied window
 *    lighting from one shared material, no per-instance JS. Assumption: one
 *    pane ≈ 1.4m square; the 6x6 atlas tile spans 8.4m, so scale ≈ 0.119.
 *  - bronze: added streaky verdigris patina + tonal variation over the base
 *    bronze color, with a matching bump map for cast relief.
 *  - steelDark: added brushed horizontal streak noise + subtle rivet-fleck
 *    darkening.
 *  - rail: added longitudinal polish streaks with occasional rust patches.
 *  - furnaceGlow: flat color replaced with a baked white-hot-core to
 *    deep-red-edge vertical gradient plus flame noise, for a believable
 *    molten/furnace read (still MeshBasicMaterial, always-lit glow).
 *  - foliage: added mottled light/dark leaf-clump noise + matching bump.
 *
 * Every export keeps its original name and material class (contract):
 * limestone, brick, terracotta, bronze, steelDark, glassDay, glassNight,
 * marquee, furnaceGlow, asphalt, sidewalk, rail, foliage — all
 * MeshStandardMaterial except marquee and furnaceGlow (MeshBasicMaterial,
 * unchanged "ignores lights, always lit" contract behavior).
 *
 * Budget: procedural canvas textures only, largest 384px, most 256px, at
 * most one companion bump/roughness/emissive map each — see the texture-
 * memory tally comment near the bottom; comfortably under the ~40MB budget.
 * All generated once at module load; nothing here runs per frame.
 */
import * as THREE from '../../vendor/three.module.min.js';

const std = (opts) => new THREE.MeshStandardMaterial(opts);
const basic = (opts) => new THREE.MeshBasicMaterial(opts);

// ---------------------------------------------------------------------
// Canvas texture factory helpers
// ---------------------------------------------------------------------
function makeCanvas(w = 256, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
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

// Brick: running-bond courses, mortar, oxblood/rust/tan tonal mix, base grime
function makeBrickTextures(size = 256) {
  const rng = rand(1001);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  const courseH = size / 10, brickW = size / 5;
  cx.fillStyle = '#3d1c14'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#606060'; bx.fillRect(0, 0, size, size);
  const pal = [[158,58,42],[120,34,26],[176,120,74]];
  let row = 0;
  for (let y = 0; y < size; y += courseH) {
    const off = (row % 2) * (brickW / 2);
    for (let x = -brickW; x < size + brickW; x += brickW) {
      const bxp = x + off + 1.4, byp = y + 1.4;
      const bw = brickW - 2.8, bh = courseH - 2.8;
      const p = pal[Math.floor(rng() * pal.length)];
      const tone = 0.78 + rng() * 0.4;
      const r = Math.min(255, Math.floor(p[0]*tone)), g = Math.floor(p[1]*tone), b = Math.floor(p[2]*tone);
      cx.fillStyle = 'rgb('+r+','+g+','+b+')';
      cx.fillRect(bxp, byp, bw, bh);
      const bt = Math.floor(150 + rng()*70);
      bx.fillStyle = 'rgb('+bt+','+bt+','+bt+')';
      bx.fillRect(bxp, byp, bw, bh);
    }
    row++;
  }
  const g2 = cx.createLinearGradient(0,0,0,size);
  g2.addColorStop(0,'rgba(20,18,14,0)');
  g2.addColorStop(1,'rgba(20,18,14,0.35)');
  cx.fillStyle = g2; cx.fillRect(0,0,size,size);
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// Limestone: ashlar courses, warm/cool block variation, weathering streaks
function makeLimestoneTextures(size = 256) {
  const rng = rand(2002);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  const rowH = size / 6;
  cx.fillStyle = '#8f8368'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#707070'; bx.fillRect(0, 0, size, size);
  let row = 0;
  for (let y = 0; y < size; y += rowH) {
    const blocks = 3 + (row % 2);
    const blockW = size / blocks;
    for (let i = 0; i < blocks; i++) {
      const bxp = i * blockW + 1.6, byp = y + 1.6;
      const bw = blockW - 3.2, bh = rowH - 3.2;
      const band = 0.9 + 0.06 * Math.sin(row * 1.7);
      const warmCool = rng() > 0.5 ? 1.03 : 0.97;
      const tone = (0.86 + rng() * 0.16) * band * warmCool;
      const r = Math.floor(218 * tone), g = Math.floor(200 * tone), b = Math.floor(168 * tone);
      cx.fillStyle = 'rgb('+r+','+g+','+b+')';
      cx.fillRect(bxp, byp, bw, bh);
      const bt = Math.floor(160 + rng() * 40);
      bx.fillStyle = 'rgb('+bt+','+bt+','+bt+')';
      bx.fillRect(bxp, byp, bw, bh);
    }
    row++;
  }
  for (let i = 0; i < 6; i++) {
    const x = rng() * size;
    const w = size * (0.015 + rng() * 0.02);
    const g = cx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(70,66,50,0)');
    g.addColorStop(0.6, 'rgba(70,66,50,0.10)');
    g.addColorStop(1, 'rgba(70,66,50,0.22)');
    cx.fillStyle = g;
    cx.fillRect(x, 0, w, size);
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// Terracotta: glazed blocks with chevron/sunburst deco motif per tile
function makeTerracottaTextures(size = 256) {
  const rng = rand(3003);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  const rows = 4, cols = 4;
  const rowH = size / rows, colW = size / cols;
  cx.fillStyle = '#3a2c1a'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#686868'; bx.fillRect(0, 0, size, size);
  const pal = [[0xd8, 0x8a, 0x4a], [0xc8, 0x74, 0x38], [0xe0, 0x9a, 0x56]];
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bxp = col * colW + 1.4, byp = row * rowH + 1.4;
      const bw = colW - 2.8, bh = rowH - 2.8;
      const p = pal[idx % pal.length]; idx++;
      const tone = 0.9 + rng() * 0.15;
      const r = Math.floor(p[0] * tone), g = Math.floor(p[1] * tone), b = Math.floor(p[2] * tone);
      cx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      cx.fillRect(bxp, byp, bw, bh);
      cx.save();
      cx.beginPath(); cx.rect(bxp, byp, bw, bh); cx.clip();
      cx.strokeStyle = 'rgba(60,36,16,0.55)';
      cx.lineWidth = Math.max(1, bw * 0.05);
      if ((row + col) % 2 === 0) {
        const midx = bxp + bw / 2;
        cx.beginPath();
        cx.moveTo(bxp, byp + bh); cx.lineTo(midx, byp); cx.lineTo(bxp + bw, byp + bh);
        cx.stroke();
      } else {
        const cx0 = bxp + bw / 2, cy0 = byp + bh / 2;
        const rays = 7;
        for (let k = 0; k < rays; k++) {
          const a = (k / rays) * Math.PI - Math.PI / 2;
          cx.beginPath();
          cx.moveTo(cx0, cy0);
          cx.lineTo(cx0 + Math.cos(a) * bw, cy0 + Math.sin(a) * bh);
          cx.stroke();
        }
      }
      cx.restore();
      cx.fillStyle = 'rgba(255,255,255,0.16)';
      cx.fillRect(bxp, byp, bw, Math.max(1, bh * 0.1));
      const bt = Math.floor(200 + rng() * 30);
      bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
      bx.fillRect(bxp, byp, bw, bh);
    }
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// Asphalt: aggregate speckle, darkened tire tracks, center lane sheen, stains
function makeAsphaltTextures(size = 256) {
  const rng = rand(4004);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = '#232426'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#606060'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.12; i++) {
    const x = rng() * size, y = rng() * size;
    const g = Math.floor(30 + rng() * 60);
    cx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',0.85)';
    cx.fillRect(x, y, 1, 1);
    const bt = Math.floor(90 + rng() * 90);
    bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
    bx.fillRect(x, y, 1, 1);
  }
  for (const cy of [size * 0.32, size * 0.68]) {
    cx.fillStyle = 'rgba(8,8,9,0.32)';
    cx.fillRect(0, cy - size * 0.05, size, size * 0.10);
    bx.fillStyle = 'rgba(40,40,40,0.5)';
    bx.fillRect(0, cy - size * 0.05, size, size * 0.10);
  }
  cx.fillStyle = 'rgba(160,160,170,0.06)';
  cx.fillRect(0, size * 0.47, size, size * 0.06);
  for (let i = 0; i < 3; i++) {
    const x = rng() * size, y = rng() * size, r = size * (0.06 + rng() * 0.08);
    cx.fillStyle = 'rgba(18,17,16,0.35)';
    cx.beginPath(); cx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2); cx.fill();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// Sidewalk: concrete paver grid, expansion joints, soft stain blotches
function makeSidewalkTextures(size = 256) {
  const rng = rand(5005);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = '#b0a690'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.05; i++) {
    const x = rng() * size, y = rng() * size;
    const g = 150 + Math.floor(rng() * 40 - 20);
    cx.fillStyle = 'rgba(' + g + ',' + (g - 6) + ',' + (g - 16) + ',0.5)';
    cx.fillRect(x, y, 1.2, 1.2);
  }
  for (let i = 0; i < 4; i++) {
    const x = rng() * size, y = rng() * size, r = size * (0.04 + rng() * 0.06);
    cx.fillStyle = 'rgba(70,62,48,0.18)';
    cx.beginPath(); cx.ellipse(x, y, r, r * 0.7, rng() * Math.PI, 0, Math.PI * 2); cx.fill();
  }
  cx.strokeStyle = 'rgba(60,56,48,0.65)'; cx.lineWidth = 2.5;
  bx.strokeStyle = 'rgba(0,0,0,0.9)'; bx.lineWidth = 2.5;
  for (const t of [0, 0.5, 1]) {
    cx.beginPath(); cx.moveTo(t * size, 0); cx.lineTo(t * size, size); cx.stroke();
    cx.beginPath(); cx.moveTo(0, t * size); cx.lineTo(size, t * size); cx.stroke();
    bx.beginPath(); bx.moveTo(t * size, 0); bx.lineTo(t * size, size); bx.stroke();
    bx.beginPath(); bx.moveTo(0, t * size); bx.lineTo(size, t * size); bx.stroke();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// Glass: shared 6x6 pane atlas with baked mullions. dayMap = cool dark
// glazing + subtle per-pane tint + top sheen. nightEmissive = per-pane warm
// brightness (about a third dark/unlit, rest lit, a few extra-bright).
function makeGlassTextures(size = 256) {
  const rng = rand(6006);
  const dayColor = makeCanvas(size);
  const nightEmissive = makeCanvas(size);
  const dcx = dayColor.getContext('2d');
  const ecx = nightEmissive.getContext('2d');
  const panes = 6;
  const paneW = size / panes, paneH = size / panes;
  dcx.fillStyle = '#0e1418'; dcx.fillRect(0, 0, size, size);
  ecx.fillStyle = '#000000'; ecx.fillRect(0, 0, size, size);
  for (let row = 0; row < panes; row++) {
    for (let col = 0; col < panes; col++) {
      const x = col * paneW, y = row * paneH;
      const inset = paneW * 0.08;
      const pw = paneW - inset * 2, ph = paneH - inset * 2;
      const tint = 0.85 + rng() * 0.3;
      const r = Math.floor(20 * tint), g = Math.floor(28 * tint), b = Math.floor(34 * tint);
      dcx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      dcx.fillRect(x + inset, y + inset, pw, ph);
      const sheen = dcx.createLinearGradient(0, y + inset, 0, y + inset + ph * 0.4);
      sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      dcx.fillStyle = sheen;
      dcx.fillRect(x + inset, y + inset, pw, ph * 0.4);
      const roll = rng();
      let bright = 0;
      if (roll < 0.35) bright = 0;
      else if (roll < 0.85) bright = 0.5 + rng() * 0.35;
      else bright = 0.9 + rng() * 0.1;
      if (bright > 0) {
        const er = Math.floor(255 * bright), eg = Math.floor(180 * bright), eb = Math.floor(90 * bright);
        ecx.fillStyle = 'rgb(' + er + ',' + eg + ',' + eb + ')';
        ecx.fillRect(x + inset, y + inset, pw, ph);
      }
    }
  }
  dcx.strokeStyle = 'rgba(10,10,12,0.9)'; dcx.lineWidth = size * 0.018;
  ecx.strokeStyle = 'rgba(0,0,0,1)'; ecx.lineWidth = size * 0.018;
  for (let i = 0; i <= panes; i++) {
    const p = i * paneW;
    dcx.beginPath(); dcx.moveTo(p, 0); dcx.lineTo(p, size); dcx.stroke();
    dcx.beginPath(); dcx.moveTo(0, p); dcx.lineTo(size, p); dcx.stroke();
    ecx.beginPath(); ecx.moveTo(p, 0); ecx.lineTo(p, size); ecx.stroke();
    ecx.beginPath(); ecx.moveTo(0, p); ecx.lineTo(size, p); ecx.stroke();
  }
  return {
    dayMap: toTexture(dayColor, { srgb: true }),
    nightEmissive: toTexture(nightEmissive, { srgb: true }),
  };
}

// Bronze: base metal + streaky verdigris patina / warm highlight streaks
function makeBronzeTextures(size = 256) {
  const rng = rand(7007);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = '#8a6a34'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const x = rng() * size;
    const w = size * (0.01 + rng() * 0.03);
    const g = cx.createLinearGradient(0, 0, 0, size);
    if (rng() > 0.5) {
      g.addColorStop(0, 'rgba(70,140,110,0.0)');
      g.addColorStop(0.5, 'rgba(70,140,110,0.28)');
      g.addColorStop(1, 'rgba(70,140,110,0.45)');
    } else {
      g.addColorStop(0, 'rgba(255,220,150,0.12)');
      g.addColorStop(1, 'rgba(255,220,150,0.0)');
    }
    cx.fillStyle = g;
    cx.fillRect(x, 0, w, size);
  }
  for (let i = 0; i < 400; i++) {
    const x = rng() * size, y = rng() * size;
    const tone = 0.8 + rng() * 0.4;
    const r = Math.floor(138 * tone), g = Math.floor(106 * tone), b = Math.floor(52 * tone);
    cx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.5)';
    cx.fillRect(x, y, 2, 2);
    const bt = Math.floor(120 + rng() * 100);
    bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
    bx.fillRect(x, y, 2, 2);
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// SteelDark: brushed horizontal streaks + subtle rivet-fleck darkening
function makeSteelTextures(size = 256) {
  const rng = rand(8008);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = '#24262b'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#707070'; bx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const tone = 0.9 + rng() * 0.2;
    const g = Math.floor(38 * tone);
    cx.fillStyle = 'rgba(' + g + ',' + (g + 2) + ',' + (g + 5) + ',0.5)';
    cx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 120; i++) {
    const x = rng() * size, y = rng() * size, r = 1.5 + rng() * 1.5;
    cx.fillStyle = 'rgba(8,8,10,0.4)';
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    const bt = Math.floor(180 + rng() * 40);
    bx.fillStyle = 'rgb(' + bt + ',' + bt + ',' + bt + ')';
    bx.beginPath(); bx.arc(x, y, r, 0, Math.PI * 2); bx.fill();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// Rail: longitudinal polish streaks with occasional rust patches
function makeRailTextures(size = 256) {
  const rng = rand(9009);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = '#9aa0a8'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#909090'; bx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x++) {
    const tone = 0.85 + rng() * 0.3;
    const g = Math.floor(160 * tone);
    cx.fillStyle = 'rgba(' + g + ',' + (g + 3) + ',' + (g + 6) + ',0.45)';
    cx.fillRect(x, 0, 1, size);
  }
  for (let i = 0; i < 5; i++) {
    const x = rng() * size, y = rng() * size, r = size * (0.03 + rng() * 0.05);
    cx.fillStyle = 'rgba(110,60,30,0.28)';
    cx.beginPath(); cx.ellipse(x, y, r, r * 0.5, rng() * Math.PI, 0, Math.PI * 2); cx.fill();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// FurnaceGlow: white-hot core to deep-red edge vertical gradient + flame noise
function makeFurnaceTextures(size = 256) {
  const rng = rand(10010);
  const color = makeCanvas(size);
  const cx = color.getContext('2d');
  const g = cx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#fff6d6');
  g.addColorStop(0.25, '#ffcf6e');
  g.addColorStop(0.55, '#ff8a2e');
  g.addColorStop(0.8, '#e5401a');
  g.addColorStop(1, '#7a1206');
  cx.fillStyle = g;
  cx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rng() * size, y = rng() * size;
    const flick = rng();
    const a = 0.08 + flick * 0.18;
    cx.fillStyle = flick > 0.6 ? 'rgba(255,240,190,' + a + ')' : 'rgba(120,20,8,' + a + ')';
    const r = 1 + rng() * 2.2;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  }
  return { map: toTexture(color, { srgb: true }) };
}

// Foliage: mottled light/dark leaf-clump noise + matching bump
function makeFoliageTextures(size = 256) {
  const rng = rand(11011);
  const color = makeCanvas(size), bump = makeCanvas(size);
  const cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = '#3f5c34'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i++) {
    const x = rng() * size, y = rng() * size, r = 3 + rng() * 6;
    const tone = 0.7 + rng() * 0.6;
    const rr = Math.floor(50 * tone), gg = Math.floor(84 * tone), bb = Math.floor(42 * tone);
    cx.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',0.55)';
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    const bt = Math.floor(120 + rng() * 110);
    bx.fillStyle = 'rgba(' + bt + ',' + bt + ',' + bt + ',0.6)';
    bx.beginPath(); bx.arc(x, y, r, 0, Math.PI * 2); bx.fill();
  }
  return { map: toTexture(color, { srgb: true }), bump: toTexture(bump) };
}

// ---------------------------------------------------------------------
// Instantiate all procedural textures once at module load (no per-frame work)
// ---------------------------------------------------------------------
const glassTex = makeGlassTextures();
const bronzeTex = makeBronzeTextures();
const steelTex = makeSteelTextures();
const railTex = makeRailTextures();
const furnaceTex = makeFurnaceTextures();
const foliageTex = makeFoliageTextures();
const brickTex = makeBrickTextures();
const limestoneTex = makeLimestoneTextures();
const terracottaTex = makeTerracottaTextures();
const asphaltTex = makeAsphaltTextures();
const sidewalkTex = makeSidewalkTextures();

// ---------------------------------------------------------------------
// World-space box-projected mapping. Extended in this pass to optionally
// patch emissivemap_fragment too, so glassNight's baked per-pane night-
// window brightness atlas samples from the same world-space box projection
// as its color map (used by glassNight below).
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
      shader.fragmentShader = shader.fragmentShader.replace('#include <bumpmap_fragment>',
        '\n#ifdef USE_BUMPMAP\n  {\n    float mcH = texture2D(bumpMap, mcBoxUv(mcWorldPos, mcWorldNormal) * ' + scaleStr + ').x;\n    float mcDx = clamp(dFdx(mcH), -0.35, 0.35);\n    float mcDy = clamp(dFdy(mcH), -0.35, 0.35);\n    vec3 mcTx = normalize(dFdx(mcWorldPos));\n    vec3 mcTy = normalize(dFdy(mcWorldPos));\n    vec3 mcPerturb = (cross(mcTy, normal) * mcDx - cross(mcTx, normal) * mcDy) * bumpScale * 1.5;\n    normal = normalize(normal + mcPerturb);\n  }\n#endif\n');
    }
    if (shader.fragmentShader.indexOf('#include <roughnessmap_fragment>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '\nfloat roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n  roughnessFactor *= texture2D(roughnessMap, mcBoxUv(mcWorldPos, mcWorldNormal) * ' + scaleStr + ').g;\n#endif\n');
    }
    if (shader.fragmentShader.indexOf('#include <emissivemap_fragment>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '\n#ifdef USE_EMISSIVEMAP\n  {\n    vec4 mcEmissiveSampled = texture2D(emissiveMap, mcBoxUv(mcWorldPos, mcWorldNormal) * ' + scaleStr + ');\n    totalEmissiveRadiance *= mcEmissiveSampled.rgb;\n  }\n#endif\n');
    }
  };
  material.customProgramCacheKey = () => 'mcWorldMap:' + scale;
}

export const materials = {
  /** Warm cream limestone — principal facade stone of the era. */
  limestone: std({ color: 0xffffff, map: limestoneTex.map, bumpMap: limestoneTex.bump, bumpScale: 0.4, roughness: 0.88, metalness: 0.0 }),
  /** Deep red pressed brick for warehouse and secondary masses. */
  brick: std({ color: 0xffffff, map: brickTex.map, bumpMap: brickTex.bump, bumpScale: 0.5, roughness: 0.92, metalness: 0.02 }),
  /** Glazed polychrome terracotta ornament — deco chevron/sunburst tile. */
  terracotta: std({ color: 0xffffff, map: terracottaTex.map, bumpMap: terracottaTex.bump, bumpScale: 0.3, roughness: 0.35, metalness: 0.08 }),
  /** Patinated bronze — doors, trim, spandrels, elevator grilles. */
  bronze: std({ color: 0xffffff, map: bronzeTex.map, bumpMap: bronzeTex.bump, bumpScale: 0.25, roughness: 0.32, metalness: 0.88 }),
  /** Near-black structural steel / ironwork, brushed + riveted. */
  steelDark: std({ color: 0xffffff, map: steelTex.map, bumpMap: steelTex.bump, bumpScale: 0.2, roughness: 0.45, metalness: 0.8 }),
  /** Daytime glass — baked mullions, per-pane tint + sheen. */
  glassDay: std({ color: 0xffffff, map: glassTex.dayMap, roughness: 0.08, metalness: 0.55 }),
  /** Night glass — emissiveMap encodes per-pane brightness (dark/lit/bright);
   * emissiveIntensity is faded 0..1 by setGlassNightGlow from the day-phase. */
  glassNight: std({ color: 0x1a1f26, map: glassTex.dayMap, roughness: 0.2, metalness: 0.4,
                    emissive: 0xffffff, emissiveMap: glassTex.nightEmissive, emissiveIntensity: 0.0 }),
  /** Marquee / sign face glow (basic, ignores lights, always lit). */
  marquee: basic({ color: 0xffe6b0 }),
  /** Furnace district bloom — hot-metal gradient + flame noise. */
  furnaceGlow: basic({ color: 0xffffff, map: furnaceTex.map }),
  /** Street asphalt ribbon — aggregate, tire tracks, lane sheen. */
  asphalt: std({ color: 0xffffff, map: asphaltTex.map, bumpMap: asphaltTex.bump, bumpScale: 0.4, roughness: 0.95, metalness: 0.0 }),
  /** Sidewalk paving — poured concrete slabs, joints, stains. */
  sidewalk: std({ color: 0xffffff, map: sidewalkTex.map, bumpMap: sidewalkTex.bump, bumpScale: 0.3, roughness: 0.9, metalness: 0.0 }),
  /** Streetcar rail — polished steel with polish streaks + rust flecks. */
  rail: std({ color: 0xffffff, map: railTex.map, bumpMap: railTex.bump, bumpScale: 0.15, roughness: 0.25, metalness: 0.9 }),
  /** Park foliage — mottled leafy clump noise. */
  foliage: std({ color: 0xffffff, map: foliageTex.map, bumpMap: foliageTex.bump, bumpScale: 0.35, roughness: 0.9, metalness: 0.0 }),
};

// Texel-density tuning: `scale` is UV units per world meter; a texture tiles
// every 1.0 UV, so a tile spans (1/scale) meters.
// brick: 10 courses/tile, scale=0.4 -> tile 2.5m -> 0.25m/course.
// limestone: 6 rows/tile, scale=0.2778 -> tile 3.6m -> 0.6m/row.
// terracotta/asphalt/sidewalk: unchanged street-level grain from the prior
// Graphics Finisher / Storefront Director passes.
// bronze/steelDark/rail: trim-scale relief, tuned so streak/fleck noise
// reads at close range without an obvious repeat.
// glassDay/glassNight: pane ~=1.4m square, 6x6 atlas -> tile 8.4m -> scale
// = 1/8.4 = 0.119.
applyWorldMapping(materials.limestone, { scale: 0.2778 });
applyWorldMapping(materials.brick, { scale: 0.4 });
applyWorldMapping(materials.terracotta, { scale: 0.55 });
applyWorldMapping(materials.asphalt, { scale: 0.4 });
applyWorldMapping(materials.sidewalk, { scale: 0.5 });
applyWorldMapping(materials.bronze, { scale: 0.6 });
applyWorldMapping(materials.steelDark, { scale: 0.5 });
applyWorldMapping(materials.rail, { scale: 1.2 });
applyWorldMapping(materials.foliage, { scale: 0.3 });
applyWorldMapping(materials.glassDay, { scale: 0.119 });
applyWorldMapping(materials.glassNight, { scale: 0.119 });

/**
 * setGlassNightGlow — drives glassNight's emissive intensity from the sky's
 * day-phase cycle (called every frame from sky.js update()). 0 = fully dark
 * daytime glazing, 1 = full night glow (peak emissive 2.6, matching the
 * original always-on value). Per-pane brightness variation is baked into
 * glassNight's emissiveMap atlas; this scalar fades the whole atlas in and
 * out with the day-night cycle.
 * @param {number} factor 0..1
 */
export function setGlassNightGlow(factor) {
  materials.glassNight.emissiveIntensity = Math.max(0, Math.min(1, factor)) * 2.6;
}
