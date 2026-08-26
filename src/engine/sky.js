/**
 * sky.js — 6-minute day-night cycle for Magic City 1929.
 *
 * createSky(scene, fog) -> { update(dt, elapsed, cameraPosition), getDayPhase(), getNightGlow() }.
 * getDayPhase(): [0,1); 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk.
 * getNightGlow(): [0,1) — the same window/lamp glow ramp update() drives
 * into materials.js each frame (0 = broad daylight, 1 = full night); main.js
 * additively uses this to drive deco.js's streetlamp point-light pool.
 * Cycle completes every 6 real minutes (360s). Animates sun + hemisphere
 * lights (with real day/night contrast), gradient sky-dome colors, fog
 * color/draw distance per keyframes, the sun's shadow-casting frustum, the
 * glassNight window emissive ramp (materials.js setGlassNightGlow), and
 * atmosphere: a sun disc that tracks the light direction, a moon + stars at
 * night, and a few layers of slow drifting cloud haze.
 *
 * FIX (Graphics Finisher pass): the draft's noon keyframe paired a bright
 * sun (2.5) with only 0.40 hemisphere fill and a renderer exposure of 1.05
 * tuned for the *original* lower-intensity keyframes — once combined with
 * materials.js's world-mapped bump overcorrection (see materials.js fix
 * notes) even a bright sun read as charcoal on walls whose perturbed
 * normals pointed away from it. With that shading bug fixed, the sun/hemi
 * balance here is kept but the whole midday band (0.40-0.60) is nudged
 * slightly brighter and warmer so sunlit limestone/brick reads clearly
 * bright-side vs. shade-side even before ACES tone mapping rolls off
 * highlights.
 */
import * as THREE from 'three';
import { setGlassNightGlow } from './materials.js';

const CYCLE_SECONDS = 360;
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

// Shadow frustum: tight ~500m span kept near the camera, snapped to
// shadow-texel increments so the map never shimmers as the player walks.
const SHADOW_SPAN = 1700;
const SHADOW_MAP_SIZE = 4096;
const SHADOW_TEXEL = SHADOW_SPAN / SHADOW_MAP_SIZE;
const SUN_DIST = 380;
const SKY_R = 2400; // radius for celestial billboards / stars, inside the 2600 dome

// --- Additive weather hook (src/systems/weather.js) --------------------
let _weatherDim = 0;
const _greyTop = new THREE.Color(0x545a63);
const _greyBottom = new THREE.Color(0x6a6e73);

/**
 * Pulls sky colors toward grey and softens sun/hemi intensity while
 * overcast or raining. 0 = clear (no change), 1 = full storm grey.
 * @param {number} factor
 */
export function setWeatherDim(factor) {
  _weatherDim = THREE.MathUtils.clamp(factor, 0, 1);
}

// Keyframes: [phase, topColorHex, horizonColorHex, sunIntensity, hemiIntensity, fogNear, fogFar]
// Rebalanced for real directional contrast at noon (strong sun, modest hemi
// fill) vs. flat wash; dawn/dusk lean warm and long; night is cold-blue dim
// ambient so lit windows and lamp pools read by contrast. Midday band
// nudged brighter/warmer than the first draft so sunlit masonry reads
// clearly once the bump-shading overcorrection (materials.js) is fixed.
const KEYS = [
  [0.00, 0x0d1226, 0x201c2c, 0.0, 0.30, 30, 620], // midnight — tight fog, city glow at horizon
  [0.20, 0x1c2238, 0x3a2c34, 0.05, 0.20, 35, 700],
  [0.27, 0xd98a52, 0xf2c48a, 1.15, 0.36, 45, 1100], // dawn — long warm light
  [0.40, 0x8fb6da, 0xdce6ec, 2.6, 0.52, 70, 2200],
  [0.50, 0x6fa3d2, 0xe6ecf0, 2.9, 0.50, 90, 2600], // noon — crisp, high-contrast, warm-white sun
  [0.60, 0x8fb6da, 0xdce6ec, 2.6, 0.52, 70, 2200],
  [0.73, 0xd96a3a, 0xf2a05c, 1.15, 0.36, 45, 1100], // dusk
  [0.80, 0x1c2238, 0x3d2f38, 0.05, 0.20, 35, 700],
  [1.00, 0x0d1226, 0x201c2c, 0.0, 0.30, 30, 620],
];

// --- Canvas texture helpers for celestial/cloud billboards --------------
function makeGlowTexture(size, coreHex, edgeHex) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, coreHex);
  g.addColorStop(0.35, coreHex);
  g.addColorStop(1.0, edgeHex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeDotTexture(size = 32) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
function makeCloudTexture(size = 256, seed = 7) {
  let a = seed >>> 0;
  const rng = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 22; i++) {
    const x = rng() * size, y = size * (0.3 + rng() * 0.4);
    const r = size * (0.12 + rng() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.10 + rng() * 0.16;
    g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Fog} fog
 */
export function createSky(scene, fog) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x141a30) },
    bottomColor: { value: new THREE.Color(0x2a2438) },
    offset: { value: 60 },
    exponent: { value: 0.7 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 24, 12),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 bottomColor;
        uniform float offset; uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float f = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);
        }`,
    })
  );
  dome.userData.noShadow = true;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SUN_DIST + SHADOW_SPAN;
  sun.shadow.camera.left = -SHADOW_SPAN / 2;
  sun.shadow.camera.right = SHADOW_SPAN / 2;
  sun.shadow.camera.top = SHADOW_SPAN / 2;
  sun.shadow.camera.bottom = -SHADOW_SPAN / 2;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 1.2;
  sun.shadow.camera.updateProjectionMatrix();

  const hemi = new THREE.HemisphereLight(0xbcd4ec, 0x6a6048, 0.6);
  scene.add(sun);
  scene.add(hemi);
  scene.add(sun.target);

  // --- Sun disc + moon: billboard sprites tracking the light direction ---
  const sunTex = makeGlowTexture(128, 'rgba(255,244,214,1)', 'rgba(255,180,80,0)');
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  sunSprite.scale.set(340, 340, 1);
  scene.add(sunSprite);

  const moonTex = makeGlowTexture(128, 'rgba(226,232,240,1)', 'rgba(170,190,220,0)');
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
  }));
  moonSprite.scale.set(160, 160, 1);
  scene.add(moonSprite);

  // --- Stars: additive point cloud on the upper dome, fades in at night ---
  const STAR_COUNT = 500;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.92); // biased toward the zenith, thin near horizon
    const r = SKY_R;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = Math.max(30, r * Math.cos(phi));
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    size: 4, map: makeDotTexture(), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // --- Cloud haze: two slow-drifting translucent layers, texture-scrolled
  // (no mesh movement needed, so they never need recentering logic) -------
  const cloudLayers = [];
  for (let li = 0; li < 2; li++) {
    const tex = makeCloudTexture(256, 11 + li * 37);
    tex.repeat.set(3, 3);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: li === 0 ? 0.5 : 0.32,
      side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 420 + li * 180;
    scene.add(mesh);
    cloudLayers.push({ mesh, tex, speed: 0.004 + li * 0.0025 });
  }

  let elapsed = 0;
  let lastGlow = 0;

  function keyIndex(phase) {
    let i = 0;
    while (i < KEYS.length - 2 && phase > KEYS[i + 1][0]) i++;
    return i;
  }
  function frac(phase, i) {
    return THREE.MathUtils.clamp((phase - KEYS[i][0]) / ((KEYS[i + 1][0] - KEYS[i][0]) || 1), 0, 1);
  }

  /**
   * Advance the cycle; returns current day phase in [0,1).
   * @param {number} dt
   * @param {number} [totalElapsed]
   * @param {{x:number,z:number}} [cameraPosition] optional — when provided,
   *   the sky dome, stars and the sun's shadow frustum are re-centered under
   *   the camera (shadow frustum snapped to shadow-texel increments to
   *   avoid shimmer) so distant sightlines never exit the dome and shadows
   *   stay tight and stable around the player.
   */
  function update(dt, totalElapsed, cameraPosition) {
    elapsed = typeof totalElapsed === 'number' ? totalElapsed : elapsed + dt;
    const phase = (elapsed / CYCLE_SECONDS) % 1;
    const i = keyIndex(phase);
    const t = frac(phase, i);

    let camX = 0, camZ = 0;
    if (cameraPosition) {
      camX = Math.round(cameraPosition.x / SHADOW_TEXEL) * SHADOW_TEXEL;
      camZ = Math.round(cameraPosition.z / SHADOW_TEXEL) * SHADOW_TEXEL;
      dome.position.set(cameraPosition.x, 0, cameraPosition.z);
      stars.position.set(cameraPosition.x, 0, cameraPosition.z);
      for (const cl of cloudLayers) cl.mesh.position.set(cameraPosition.x, cl.mesh.position.y, cameraPosition.z);
    }

    // Sun arcs east->west across the southern sky (+Z is south).
    const elev = Math.sin((phase - 0.25) * Math.PI * 2); // >0 between dawn and dusk
    const azim = phase * Math.PI * 2 - Math.PI / 2;
    const dirX = Math.cos(azim);
    const dirY = Math.max(elev, -0.2);
    const dirZ = Math.sin(azim) * 0.4 + 0.35;
    sun.target.position.set(camX, 0, camZ);
    sun.position.set(camX + dirX * SUN_DIST, dirY * SUN_DIST + 40, camZ + dirZ * SUN_DIST);
    sun.intensity = KEYS[i][3] + (KEYS[i + 1][3] - KEYS[i][3]) * t;
    hemi.intensity = KEYS[i][4] + (KEYS[i + 1][4] - KEYS[i][4]) * t;

    uniforms.topColor.value.copy(_tmpA.setHex(KEYS[i][1]).lerp(_tmpB.setHex(KEYS[i + 1][1]), t));
    uniforms.bottomColor.value.copy(_tmpA.setHex(KEYS[i][2]).lerp(_tmpB.setHex(KEYS[i + 1][2]), t));
    fog.color.copy(uniforms.bottomColor.value);
    fog.near = KEYS[i][5] + (KEYS[i + 1][5] - KEYS[i][5]) * t;
    fog.far = KEYS[i][6] + (KEYS[i + 1][6] - KEYS[i][6]) * t;

    // Additive weather dimming — see setWeatherDim() above.
    if (_weatherDim > 0) {
      sun.intensity *= (1 - _weatherDim * 0.75);
      hemi.intensity *= (1 - _weatherDim * 0.35);
      uniforms.topColor.value.lerp(_greyTop, _weatherDim * 0.85);
      uniforms.bottomColor.value.lerp(_greyBottom, _weatherDim * 0.85);
      fog.color.copy(uniforms.bottomColor.value);
      fog.near *= (1 - _weatherDim * 0.2);
      fog.far *= (1 - _weatherDim * 0.45);
    }

    // Window/lamp glow ramps in through dusk (~0.72-0.8) to full at night, and
    // symmetrically out through dawn (~0.20-0.27) — zero at broad daylight.
    let glow = 0;
    if (phase > 0.80 || phase < 0.20) glow = 1;
    else if (phase >= 0.72 && phase <= 0.80) glow = (phase - 0.72) / 0.08;
    else if (phase >= 0.20 && phase <= 0.27) glow = 1 - (phase - 0.20) / 0.07;
    setGlassNightGlow(glow);
    lastGlow = glow;

    // Sun/moon billboards track the light direction; sun fades out at night,
    // moon fades out by day. Both sit just inside the sky dome radius.
    const dlen = Math.hypot(dirX, dirY, dirZ) || 1;
    const ndx = dirX / dlen, ndy = dirY / dlen, ndz = dirZ / dlen;
    sunSprite.position.set(camX + ndx * SKY_R, Math.max(ndy, 0.03) * SKY_R + 60, camZ + ndz * SKY_R);
    sunSprite.material.opacity = THREE.MathUtils.clamp(elev * 3.2, 0, 1) * (1 - _weatherDim * 0.6);
    moonSprite.position.set(camX - ndx * SKY_R, Math.max(-ndy, 0.05) * SKY_R + 60, camZ - ndz * SKY_R);
    moonSprite.material.opacity = THREE.MathUtils.clamp(-elev * 3.2, 0, 1) * (1 - _weatherDim * 0.5);

    // Stars fade in with the same night-glow ramp used for windows.
    starMat.opacity = glow * 0.85 * (1 - _weatherDim * 0.7);

    // Cloud layers drift slowly via texture offset (allocation-free).
    for (const cl of cloudLayers) {
      cl.tex.offset.x = (cl.tex.offset.x + dt * cl.speed) % 1;
      cl.tex.offset.y = (cl.tex.offset.y + dt * cl.speed * 0.4) % 1;
      cl.mesh.material.opacity = (cl.mesh === cloudLayers[0].mesh ? 0.5 : 0.32) * (1 - _weatherDim * 0.3) * (0.35 + 0.65 * Math.max(0.15, 1 - glow * 0.5));
    }

    return phase;
  }

  function getDayPhase() { return (elapsed / CYCLE_SECONDS) % 1; }
  function getNightGlow() { return lastGlow; }

  update(0, 0);
  return { update, getDayPhase, getNightGlow, sun, hemi, dome };
}
