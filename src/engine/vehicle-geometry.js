import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from './deco-shared.js';

const PROFILE = [
  [-0.88, 0], [-0.98, 0.07], [-1, 0.26], [-1, 0.68], [-0.93, 0.90],
  [-0.68, 0.99], [0, 1], [0.68, 0.99], [0.93, 0.90], [1, 0.68],
  [1, 0.26], [0.98, 0.07], [0.88, 0],
].reverse();
const Y = new THREE.Vector3(0, 1, 0);

export function loft(rings) {
  const positions = [];
  const indices = [];
  const stride = PROFILE.length;
  for (const [z, width, bottom, top] of rings) {
    for (const [x, y] of PROFILE) positions.push(x * width, bottom + (top - bottom) * y, z);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < stride; i++) {
      const a = ring * stride + i;
      const b = ring * stride + (i + 1) % stride;
      indices.push(a, b, a + stride, b, b + stride, a + stride);
    }
  }
  for (let i = 1; i < stride - 1; i++) {
    const far = (rings.length - 1) * stride;
    indices.push(0, i + 1, i, far, far + i, far + i + 1);
  }
  return surface(positions, indices);
}

export function surface(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function bar(from, to, radius, sides = 7) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, direction.normalize()));
  a.lerp(b, 0.5);
  return geometry.translate(a.x, a.y, a.z);
}

export function box(x, y, z, width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

export function panel(corners) {
  return surface(corners.flat(), [0, 1, 2, 0, 2, 3]);
}

export function pane(target, trim, corners, rim = .026) {
  target.push(panel(corners));
  for (let i = 0; i < corners.length; i++) {
    trim.push(bar(corners[i], corners[(i + 1) % corners.length], rim));
  }
}

export function batch(parent, pieces, material, castsShadow = true) {
  if (!pieces.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
  for (const geometry of pieces) geometry.dispose();
  mesh.castShadow = castsShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

let clothGrain;
export function seatFabric(color = 0x846953) {
  if (!clothGrain) {
    const size = 48, pixels = new Uint8Array(size * size * 4);
    for (let y=0;y<size;y++) {
      for (let x=0;x<size;x++) {
        const ridge = Math.cos(x*Math.PI/2)*6 + Math.cos(y*Math.PI/2)*6;
        const tone = 173 + ridge + ((x*73+y*37+x*y*13)%19);
        const i = (y*size+x)*4;
        pixels.set([tone,tone,tone,255],i);
      }
    }
    clothGrain = new THREE.DataTexture(pixels,size,size);
    clothGrain.wrapS = clothGrain.wrapT = THREE.RepeatWrapping;
    clothGrain.magFilter = THREE.LinearFilter;
    clothGrain.minFilter = THREE.LinearMipmapLinearFilter;
    clothGrain.generateMipmaps = true;
    clothGrain.anisotropy = 4;
    clothGrain.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({
    color, bumpMap:clothGrain, bumpScale:.009, roughness:.92,
  });
}

export function headlightBeam(chassis, x, y, z) {
  const light = new THREE.SpotLight(0xffddb0, 0, 38, Math.PI / 7.5, 0.49, 1.7);
  light.position.set(x,y,z);
  const aim = new THREE.Object3D();
  aim.position.set(x,.12,14);
  light.target = aim;
  chassis.add(light,aim);
  return light;
}
