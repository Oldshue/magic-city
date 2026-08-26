/**
 * renderer.js — WebGLRenderer, scene, camera, fog for Magic City 1929.
 *
 * Hermetic sizing: no browsing-context globals here. The renderer sizes
 * itself from its container element's own box (clientWidth/clientHeight)
 * and stays in sync via a ResizeObserver on that same element — it never
 * reads innerWidth/innerHeight off a browsing-context root and never
 * listens for a global resize event.
 */
import * as THREE from 'three';

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
  renderer.toneMappingExposure = 1.05;

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
