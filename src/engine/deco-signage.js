/**
 * deco-signage.js - canvasSign and decoDoorway, unchanged public signatures
 * from deco.js v1, split out here purely for file-size management.
 */
import * as THREE from 'three';
import { materials } from './materials.js';

/**
 * canvasSign - glowing marquee sign: chevron-framed panel with text drawn
 * to a CanvasTexture (no external fonts).
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.width=10] world width (m); height follows aspect
 * @param {number} [opts.canvasWidth=512]
 * @param {number} [opts.canvasHeight=128]
 * @returns {THREE.Group} plane centered at origin facing +Z
 */
export function canvasSign(text, opts = {}) {
  const { width = 10, canvasWidth = 512, canvasHeight = 128 } = opts;
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = '#b98d3e';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, canvasWidth - 20, canvasHeight - 20);
    ctx.fillStyle = '#b98d3e';
    const step = 24;
    for (let x = 20; x < canvasWidth - 40; x += step * 2) {
      ctx.beginPath();
      ctx.moveTo(x, canvasHeight - 16); ctx.lineTo(x + step, canvasHeight - 26);
      ctx.lineTo(x + step * 2, canvasHeight - 16); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, 16); ctx.lineTo(x + step, 26);
      ctx.lineTo(x + step * 2, 16); ctx.closePath(); ctx.fill();
    }
    ctx.font = 'bold ' + Math.floor(canvasHeight * 0.42) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe6b0';
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * canvasHeight / canvasWidth), mat);
  group.add(mesh);
  group.userData.redraw = () => { draw(); texture.needsUpdate = true; };
  return group;
}

/**
 * decoDoorway - bronze-framed recessed entrance with fan light above.
 * @param {object} [opts]
 * @param {number} [opts.width=3]
 * @param {number} [opts.height=4.5]
 * @param {THREE.Material} [opts.frameMaterial=materials.bronze]
 * @param {THREE.Material} [opts.doorMaterial=materials.steelDark]
 * @returns {THREE.Group} base at y=0, faces +Z
 */
export function decoDoorway(opts = {}) {
  const { width = 3, height = 4.5,
          frameMaterial = materials.bronze, doorMaterial = materials.steelDark } = opts;
  const g = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.72, 0.15), doorMaterial);
  door.position.set(0, height * 0.36, -0.25);
  g.add(door);
  const fan = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.5, 16, 0, Math.PI), materials.marquee
  );
  fan.position.set(0, height * 0.72, -0.24);
  g.add(fan);
  const jw = 0.22;
  for (const x of [-width / 2 - jw / 2, width / 2 + jw / 2]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jw, height, 0.3), frameMaterial);
    jamb.position.set(x, height / 2, 0);
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + jw * 2 + 0.4, 0.3, 0.3), frameMaterial);
  lintel.position.set(0, height + 0.15, 0);
  g.add(lintel);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.22, 0.3), frameMaterial);
  crest.position.set(0, height + 0.41, 0);
  g.add(crest);
  return g;
}
