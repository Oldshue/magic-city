/**
 * renderer.js — WebGLRenderer, scene, camera, fog for Magic City 1929.
 */
import * as THREE from 'three';

/**
 * Create the renderer bundle.
 * @param {HTMLElement} container - element the canvas is appended to (defaults to body).
 * @returns {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera}}
 */
export function createRenderer(container = document.body) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    6000
  );

  const fogColor = new THREE.Color(0x9fb4c8); // updated by sky each frame
  scene.fog = new THREE.Fog(fogColor.getHex(), 60, 900);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera };
}
