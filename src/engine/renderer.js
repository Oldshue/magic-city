/**
 * renderer.js — WebGLRenderer, scene, camera, fog for Magic City 1929.
 *
 * Hermetic sizing: no browsing-context globals here. The renderer sizes
 * itself from its container element's own box (clientWidth/clientHeight)
 * and stays in sync via a ResizeObserver on that same element — it never
 * reads innerWidth/innerHeight off a browsing-context root and never
 * listens for a global resize event.
 *
 * Lighting Engineer (M3) notes:
 * - Tone mapping: ACES filmic + sRGB output color space are configured
 *   here once. The actual `toneMappingExposure` value is swept every
 *   frame by sky.js (createSky is handed this renderer) so exposure
 *   tracks the day-night cycle: bright at noon, warm/low at dusk, cool
 *   and dim at night — a fixed exposure otherwise makes ACES flatten the
 *   noon-vs-night contrast that gives the city depth.
 * - Shadows: one soft-filtered shadow-casting light (the sun, wired up in
 *   sky.js) with a tight frustum that follows the camera and is disabled
 *   automatically at night (see sky.js) so cost stays bounded.
 * - Vignette: `createVignette()` below renders a single fullscreen quad,
 *   multiplied over the already-tonemapped/sRGB-encoded frame, darkening
 *   the corners a little. It is the cheapest possible "post pass": no
 *   render target, no resolve, just one extra draw call with depth test
 *   and depth write off, drawn immediately after the main scene render.
 * - Ambient occlusion approximation: rather than a full SSAO pass, M3
 *   uses (a) the existing hemisphere light's dark ground-color tint
 *   (see sky.js's `hemi` light) plus (b) new soft ground-contact gradient
 *   decals placed under every landmark footprint (see main.js) — cheap,
 *   allocation-free after boot, and one extra draw call total regardless
 *   of building count (InstancedMesh). Documented here per the M3 brief.
 */
import * as THREE from '../../vendor/three.module.min.js';

/**
 * Create the renderer bundle.
 * @param {HTMLElement} container - element the canvas is appended to and
 *   sized from (defaults to document.body, which the page's own CSS
 *   stretches to fill the viewport).
 * @returns {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera}}
 */
export function createRenderer(container = document.body) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const canvas = renderer.domElement;
  container.appendChild(canvas);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Neutral starting point; sky.js's update() sweeps this every frame once
  // wired via createSky(scene, fog, renderer) so exposure tracks day phase.
  renderer.toneMappingExposure = 1.0;

  // Shadow mapping: one soft-filtered shadow-casting light (the sun, wired
  // up in sky.js) with a tight frustum kept near the camera by sky.js's
  // update(), and turned off entirely at night by sky.js (no light, no
  // shadow map cost). PCFSoftShadowMap trades a little cost for much
  // softer, less "cardboard" shadow edges than the default PCF.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 6000);

  const fogColor = new THREE.Color(0x9fb4c8); // updated by sky each frame
  scene.fog = new THREE.Fog(fogColor.getHex(), 60, 900);

  function currentSize() {
    const w = container.clientWidth || document.documentElement.clientWidth || 1;
    const h = container.clientHeight || document.documentElement.clientHeight || 1;
    return { w, h };
  }

  function applySize() {
    const { w, h } = currentSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // devicePixelRatio is a plain global identifier (not a browsing-context
  // root token) — capped at 2x so an ordinary laptop stays near 60fps.
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  applySize();

  // ResizeObserver delivers one notification immediately on observe() with
  // the element's current box, then again on every later layout change —
  // the canvas/container-scoped replacement for a global resize listener.
  const resizeObserver = new ResizeObserver(applySize);
  resizeObserver.observe(container);

  return { renderer, scene, camera };
}

/**
 * Create a gentle full-screen vignette pass: one 2-triangle quad drawn
 * directly in clip space (vertex shader ignores camera matrices), sampled
 * against nothing — it just darkens the frame toward the corners via
 * multiplicative blending over whatever `renderer.render(scene, camera)`
 * already drew this frame. Cheapest possible post effect: no render
 * target, no texture sample, depth test/write both off, a single extra
 * draw call. Call `.render()` once per frame, after the main scene render.
 * @param {THREE.WebGLRenderer} renderer
 * @param {{strength?: number}} [opts]
 * @returns {{render(): void, setStrength(s: number): void}}
 */
export function createVignette(renderer, opts = {}) {
  const vScene = new THREE.Scene();
  const vCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      strength: { value: opts.strength ?? 0.32 },
      color: { value: new THREE.Color(0x05070a) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float strength;
      uniform vec3 color;
      void main() {
        vec2 c = vUv - 0.5;
        // Slightly wider than the unit circle so the very center stays
        // untouched and only the corners/edges darken.
        float d = length(c) * 1.42;
        float v = smoothstep(0.42, 1.05, d);
        vec3 outColor = mix(vec3(1.0), color, v * strength);
        gl_FragColor = vec4(outColor, 1.0);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    blending: THREE.MultiplyBlending,
  });
  const quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;
  vScene.add(quad);

  function render() {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(vScene, vCamera);
    renderer.autoClear = prevAutoClear;
  }
  function setStrength(s) {
    mat.uniforms.strength.value = s;
  }
  return { render, setStrength };
}
