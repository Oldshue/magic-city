/**
 * sky.js — 6-minute day-night cycle for Magic City 1929.
 *
 * createSky(scene, fog) -> { update(dt, elapsed), getDayPhase() }.
 * getDayPhase(): [0,1); 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk.
 * Cycle completes every 6 real minutes (360s). Animates sun + hemisphere
 * lights, gradient sky-dome colors, fog color/draw distance per keyframes.
 */
import * as THREE from 'three';

const CYCLE_SECONDS = 360;
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

// Keyframes: [phase, topColorHex, horizonColorHex, sunIntensity, hemiIntensity, fogNear, fogFar]
// Midnight/pre-dawn lifted so building massing still reads against the sky;
// the horizon carries a faint warm city-glow at midnight (streetlamps, windows).
const KEYS = [
  [0.00, 0x141a30, 0x2a2438, 0.0, 0.22, 30, 500], // midnight
  [0.20, 0x232a44, 0x45343c, 0.05, 0.28, 40, 600],
  [0.27, 0xd98a52, 0xf2c48a, 0.85, 0.55, 50, 850], // dawn
  [0.40, 0xa8c4dc, 0xd8e2ea, 1.35, 0.75, 60, 950],
  [0.60, 0xa8c4dc, 0xd8e2ea, 1.35, 0.75, 60, 950],
  [0.73, 0xd96a3a, 0xf2a05c, 0.90, 0.50, 50, 800], // dusk
  [0.80, 0x232a44, 0x3d2f38, 0.05, 0.25, 40, 600],
  [1.00, 0x141a30, 0x2a2438, 0.0, 0.22, 30, 500],
];

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
    new THREE.SphereGeometry(1100, 24, 12),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
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
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
  const hemi = new THREE.HemisphereLight(0xcfe0ee, 0x8a7a5c, 0.6);
  scene.add(sun);
  scene.add(hemi);
  scene.add(sun.target);

  let elapsed = 0;

  function keyIndex(phase) {
    let i = 0;
    while (i < KEYS.length - 2 && phase > KEYS[i + 1][0]) i++;
    return i;
  }
  function frac(phase, i) {
    return THREE.MathUtils.clamp((phase - KEYS[i][0]) / ((KEYS[i + 1][0] - KEYS[i][0]) || 1), 0, 1);
  }

  /** Advance the cycle; returns current day phase in [0,1). */
  function update(dt, totalElapsed) {
    elapsed = typeof totalElapsed === 'number' ? totalElapsed : elapsed + dt;
    const phase = (elapsed / CYCLE_SECONDS) % 1;
    const i = keyIndex(phase);
    const t = frac(phase, i);

    // Sun arcs east->west across the southern sky (+Z is south).
    const elev = Math.sin((phase - 0.25) * Math.PI * 2); // >0 between dawn and dusk
    const azim = phase * Math.PI * 2 - Math.PI / 2;
    const dist = 400;
    sun.position.set(Math.cos(azim) * dist, Math.max(elev, -0.2) * dist, Math.sin(azim) * dist * 0.4 + 150);
    sun.intensity = KEYS[i][3] + (KEYS[i + 1][3] - KEYS[i][3]) * t;
    hemi.intensity = KEYS[i][4] + (KEYS[i + 1][4] - KEYS[i][4]) * t;

    uniforms.topColor.value.copy(_tmpA.setHex(KEYS[i][1]).lerp(_tmpB.setHex(KEYS[i + 1][1]), t));
    uniforms.bottomColor.value.copy(_tmpA.setHex(KEYS[i][2]).lerp(_tmpB.setHex(KEYS[i + 1][2]), t));
    fog.color.copy(uniforms.bottomColor.value);
    fog.near = KEYS[i][5] + (KEYS[i + 1][5] - KEYS[i][5]) * t;
    fog.far = KEYS[i][6] + (KEYS[i + 1][6] - KEYS[i][6]) * t;

    return phase;
  }

  function getDayPhase() { return (elapsed / CYCLE_SECONDS) % 1; }

  update(0, 0);
  return { update, getDayPhase, sun, hemi, dome };
}
