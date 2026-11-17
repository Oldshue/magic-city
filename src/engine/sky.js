/** Day/night lighting, sky, weather and camera-relative sun shadows. */
import * as THREE from '../../vendor/three.module.min.js';
import { setGlassNightGlow } from './materials.js';

const CYCLE_SECONDS = 360;
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();
const HEMI_SKY_DAY = new THREE.Color(0xbcd4ec);
const HEMI_GROUND_DAY = new THREE.Color(0x6a6048);
const HEMI_SKY_NIGHT = new THREE.Color(0x5c6c9c);
const HEMI_GROUND_NIGHT = new THREE.Color(0x3b2f25);

// Shadow frustum: a genuinely tight ~300m span kept centered on the
// camera (re-snapped every frame in update(), see SHADOW_TEXEL below), at
// 2048 map resolution per the M3 spec. Texel size ~0.146m keeps shadow
// edges on building facades crisp without acne; the frustum only needs to
// cover the player's immediate surroundings since it re-centers as they
// walk — distant districts were never meant to carry sun shadows.
const SHADOW_SPAN = 300;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_TEXEL = SHADOW_SPAN / SHADOW_MAP_SIZE;
const SUN_DIST = 380;
const SKY_R = 2400; // Radius for the moon and stars, inside the sky dome.

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
  [0.00, 0x0d1226, 0x201c2c, 0.0, 0.33, 60, 620], // midnight — the electric city keeps a floor of glow
  [0.20, 0x1c2238, 0x3a2c34, 0.05, 0.26, 35, 700],
  [0.27, 0x4b6687, 0xce9877, 1.15, 0.44, 45, 1100], // dawn — long warm light
  [0.40, 0x8fb6da, 0xdce6ec, 2.6, 0.68, 70, 2200],
  [0.50, 0x6fa3d2, 0xe6ecf0, 2.9, 0.66, 90, 2600], // noon — crisp sun over a luminous southern sky bounce
  [0.60, 0x8fb6da, 0xdce6ec, 2.6, 0.68, 70, 2200], // afternoon holds the same bright fill
  [0.73, 0x465b7e, 0xcd896f, 1.15, 0.44, 45, 1100], // dusk
  [0.80, 0x1c2238, 0x3d2f38, 0.05, 0.26, 35, 700],
  [1.00, 0x0d1226, 0x201c2c, 0.0, 0.33, 60, 620],
];

// Exposure keyframes paired 1:1 with KEYS' phase breakpoints above. ACES
// filmic tone mapping alone will flatten noon-vs-night contrast if
// exposure stays fixed, so exposure is swept the same way brightness is:
// bright at noon, a warm mid-level at dawn/dusk, cool and dim at night.
//
const EXPOSURE = [1.0, 1.0, 1.05, 1.05, 1.15, 1.05, 1.05, 1.0, 1.0];

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
// A tileable, seeded density field. Generate it once so the dome shader
// can sample several cloud layers without computing noise per pixel.
function makeCloudTexture(size = 256) {
  const pixels = new Uint8Array(size * size);
  const density = new Float32Array(pixels.length);
  let seed = 1929;
  for (let cells = 4, weight = 0.49; cells <= 64; cells *= 2, weight *= 0.55) {
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      lattice[i] = seed / 4294967296;
    }
    for (let y = 0; y < size; y++) {
      const row = y * cells / size;
      const y0 = Math.floor(row);
      const y1 = (y0 + 1) % cells;
      const v = row - y0;
      const ty = v * v * (3 - 2 * v);
      for (let x = 0; x < size; x++) {
        const col = x * cells / size;
        const x0 = Math.floor(col);
        const x1 = (x0 + 1) % cells;
        const u = col - x0;
        const tx = u * u * (3 - 2 * u);
        const a = THREE.MathUtils.lerp(lattice[y0 * cells + x0], lattice[y0 * cells + x1], tx);
        const b = THREE.MathUtils.lerp(lattice[y1 * cells + x0], lattice[y1 * cells + x1], tx);
        density[y * size + x] += weight * THREE.MathUtils.lerp(a, b, ty);
      }
    }
  }
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.round(255 * Math.min(1, density[i]));
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Fog} fog
 * @param {THREE.WebGLRenderer} [renderer] - optional; when supplied,
 *   toneMappingExposure is swept every frame from the EXPOSURE keyframes
 *   above so exposure tracks the day-night cycle.
 */
export function createSky(scene, fog, renderer) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x141a30) },
    bottomColor: { value: new THREE.Color(0x2a2438) },
    clouds: { value: makeCloudTexture() },
    wind: { value: new THREE.Vector2() },
    sunDirection: { value: new THREE.Vector3() },
    night: { value: 0 },
    overcast: { value: 0 },
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
      toneMapped: false,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform sampler2D clouds;
        uniform vec2 wind;
        uniform vec3 sunDirection;
        uniform float night;
        uniform float overcast;
        varying vec3 vWorldPosition;

        void main() {
          vec3 ray = normalize(vWorldPosition - cameraPosition);
          float altitude = max(ray.y, 0.0);
          vec3 color = mix(bottomColor, topColor, pow(altitude, 0.58));
          float towardSun = max(dot(ray, sunDirection), 0.0);
          float daylight = (1.0 - night) * smoothstep(-0.04, 0.12, sunDirection.y);
          float clearLight = daylight * (1.0 - overcast * 0.86);
          float haze = pow(towardSun, 11.0) * clearLight;
          vec3 sunlight = mix(vec3(1.0, 0.48, 0.23), vec3(1.0, 0.91, 0.72),
                              smoothstep(0.05, 0.63, sunDirection.y));
          color += sunlight * (0.16 * haze + 0.24 * pow(towardSun, 120.0) * clearLight);

          // Intersect both cloud heights along the sight ray. The horizon
          // fade represents atmospheric extinction and avoids a visible edge.
          vec2 ground = cameraPosition.xz;
          float invAltitude = 1.0 / max(altitude, 0.065);
          vec2 lowUV = (ground + ray.xz * max(240.0, 820.0 - cameraPosition.y) * invAltitude)
                       / 2900.0 + wind;
          vec2 highUV = (ground + ray.xz * max(320.0, 1600.0 - cameraPosition.y) * invAltitude)
                        / 3800.0 + wind.yx + vec2(0.33, 0.81);
          float low = texture2D(clouds, lowUV).r;
          float high = texture2D(clouds, highUV).r;
          float horizonFade = smoothstep(0.045, 0.24, altitude);
          float lowCover = smoothstep(0.49 - overcast * 0.16, 0.68 - overcast * 0.13, low);
          float highCover = smoothstep(0.49 - overcast * 0.12, 0.72 - overcast * 0.12, high);
          float sunwardDensity = texture2D(clouds, lowUV + sunDirection.xz * 0.027).r;
          float litEdge = clamp(0.45 + (low - sunwardDensity) * 5.5, 0.0, 1.0);
          vec3 cloudColor = mix(topColor * 0.72, vec3(0.83, 0.86, 0.9),
                                (1.0 - night) * (0.30 + litEdge * 0.48) * (1.0 - overcast * 0.55));
          cloudColor += sunlight * haze * litEdge * 0.15;

          float disc = smoothstep(0.999942, 0.999975, towardSun) * clearLight;
          color = mix(color, sunlight * 1.3, disc);
          color = mix(color, mix(color, cloudColor, 0.65), highCover * horizonFade * 0.65);
          color = mix(color, cloudColor, lowCover * horizonFade * 0.88);

          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
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
  // Tuned for the tighter 300m/2048px frustum above (~14.6cm texels): a
  // smaller normalBias than the old 1700m frustum needed, enough to stop
  // facade acne at grazing dawn/dusk angles without visible peter-panning.
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.5;
  sun.shadow.camera.updateProjectionMatrix();

  const hemi = new THREE.HemisphereLight(0xbcd4ec, 0x6a6048, 0.6);
  scene.add(sun);
  scene.add(hemi);
  scene.add(sun.target);

  // --- Moon fill: faint bluish DirectionalLight opposite the sun ---------
  // Gives night silhouettes real form (a second, cooler light direction)
  // even before lamp/window glow takes over. No shadow - cost stays
  // bounded to the single sun shadow-caster. Position/intensity are set
  // each frame in update() below, ramped by the same night-glow factor as
  // windows/lamps (~0.25 at full night, 0 by day).
  const moon = new THREE.DirectionalLight(0x8fb0e6, 0);
  moon.castShadow = false;
  scene.add(moon);
  scene.add(moon.target);

  // --- Furnace district fill: Birmingham's furnaces sit south of downtown
  // (+Z, per the coordinate contract). A low, warm directional fill washes
  // building south faces at night with the furnace-glow-on-the-horizon
  // look the world bible describes, independent of the sun/moon arc.
  // Never casts a shadow - the sun stays the only shadow-casting light so
  // cost stays bounded to one shadow map.
  const furnaceFill = new THREE.DirectionalLight(0xff6a35, 0);
  furnaceFill.castShadow = false;
  furnaceFill.position.set(0, 50, 900);
  furnaceFill.target.position.set(0, 0, 0);
  scene.add(furnaceFill, furnaceFill.target);

  // Moon billboard follows the opposite arc from the shader's sun.
  const moonTex = makeGlowTexture(128, 'rgba(226,232,240,1)', 'rgba(170,190,220,0)');
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
  }));
  moonSprite.scale.set(60, 60, 1);
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
   * @param {{x:number,z:number}} [cameraPosition] optional - when provided,
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

    // Moon sits opposite the sun across the sky; its intensity ramp is set
    // further below once night glow is computed.
    moon.target.position.set(camX, 0, camZ);
    moon.position.set(camX - dirX * SUN_DIST, Math.max(-dirY, 0.15) * SUN_DIST + 40, camZ - dirZ * SUN_DIST);

    sun.castShadow = sun.intensity > 0.05;

    uniforms.topColor.value.copy(_tmpA.setHex(KEYS[i][1]).lerp(_tmpB.setHex(KEYS[i + 1][1]), t));
    uniforms.bottomColor.value.copy(_tmpA.setHex(KEYS[i][2]).lerp(_tmpB.setHex(KEYS[i + 1][2]), t));
    fog.color.copy(uniforms.bottomColor.value);
    fog.near = KEYS[i][5] + (KEYS[i + 1][5] - KEYS[i][5]) * t;
    fog.far = KEYS[i][6] + (KEYS[i + 1][6] - KEYS[i][6]) * t;

    if (_weatherDim > 0) {
      sun.intensity *= (1 - _weatherDim * 0.75);
      hemi.intensity *= (1 - _weatherDim * 0.35);
      uniforms.topColor.value.lerp(_greyTop, _weatherDim * 0.85);
      uniforms.bottomColor.value.lerp(_greyBottom, _weatherDim * 0.85);
      fog.color.copy(uniforms.bottomColor.value);
      fog.near *= (1 - _weatherDim * 0.2);
      fog.far *= (1 - _weatherDim * 0.45);
    }

    if (renderer) {
      const exposure = EXPOSURE[i] + (EXPOSURE[i + 1] - EXPOSURE[i]) * t;
      renderer.toneMappingExposure = exposure * (1 - _weatherDim * 0.15);
    }

    let glow = 0;
    if (phase > 0.80 || phase < 0.20) glow = 1;
    else if (phase >= 0.72 && phase <= 0.80) glow = (phase - 0.72) / 0.08;
    else if (phase >= 0.20 && phase <= 0.27) glow = 1 - (phase - 0.20) / 0.07;
    setGlassNightGlow(glow);
    lastGlow = glow;

    hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, glow);
    hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, glow);

    furnaceFill.intensity = glow * 0.21 * (1 - _weatherDim * 0.4);
    moon.intensity = glow * 0.29 * (1 - _weatherDim * 0.3);

    const dlen = Math.hypot(dirX, dirY, dirZ) || 1;
    const ndx = dirX / dlen, ndy = dirY / dlen, ndz = dirZ / dlen;
    uniforms.sunDirection.value.set(ndx, ndy, ndz);
    uniforms.night.value = glow;
    uniforms.overcast.value = _weatherDim;
    const wind = uniforms.wind.value;
    wind.set((wind.x + dt * 0.0031) % 1, (wind.y + dt * 0.0012) % 1);
    moonSprite.position.set(camX - ndx * SKY_R, Math.max(-ndy, 0.05) * SKY_R + 60, camZ - ndz * SKY_R);
    moonSprite.material.opacity = THREE.MathUtils.clamp(-elev * 3.2, 0, 1) * (1 - _weatherDim * 0.5);

    starMat.opacity = glow * 0.85 * (1 - _weatherDim * 0.7);

    return phase;
  }

  function getDayPhase() { return (elapsed / CYCLE_SECONDS) % 1; }
  function getNightGlow() { return lastGlow; }

  update(0, 0);
  return { update, getDayPhase, getNightGlow, sun, hemi, dome, furnaceFill, moon };
}
