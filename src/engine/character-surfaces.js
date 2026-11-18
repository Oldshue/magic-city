import * as THREE from '../../vendor/three.module.min.js';

const TAU = Math.PI * 2;
const TILE_SIZE = 64;
const cloth = new Map();
let skin;

function texture(pixels,size,repeat=1) {
  const map = new THREE.DataTexture(pixels,size,size);
  if (repeat > 1) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.setScalar(repeat);
    map.anisotropy = 4;
  }
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

function normalFromRelief(relief,size,repeat,strength) {
  const rgba = new Uint8Array(size * size * 4);
  for (let y=0; y<size; y++) {
    const above = ((y + 1) % size) * size;
    const below = ((y + size - 1) % size) * size;
    const row = y * size;
    for (let x=0; x<size; x++) {
      const dx = (relief[row + (x + 1) % size] - relief[row + (x + size - 1) % size]) * strength;
      const dy = (relief[above + x] - relief[below + x]) * strength;
      const length = Math.hypot(dx,dy,1);
      const at = (row+x)*4;
      rgba[at] = Math.round(127.5 * (1 - dx / length));
      rgba[at + 1] = Math.round(127.5 * (1 + dy / length));
      rgba[at + 2] = Math.round(127.5 * (1 + 1 / length));
      rgba[at + 3] = 255;
    }
  }
  return texture(rgba,size,repeat);
}

function clothMaps(kind) {
  if (cloth.has(kind)) return cloth.get(kind);
  const relief = new Float32Array(TILE_SIZE ** 2);
  const light = new Uint8Array(relief.length * 4);
  const wool = kind === 'wool';
  for (let y=0; y<TILE_SIZE; y++) {
    for (let x=0; x<TILE_SIZE; x++) {
      const u = (x + .5) / TILE_SIZE * 4;
      const v = (y + .5) / TILE_SIZE * 4;
      const col = Math.floor(u), row = Math.floor(v);
      const warp = (.5 - .5 * Math.cos(TAU * u)) ** 1.8;
      const weft = (.5 - .5 * Math.cos(TAU * v)) ** 1.8;
      const warpOnTop = wool ? (col + row) % 4 < 2 : (col + row) % 2 === 0;
      const thread = warpOnTop ? .78 * warp + .22 * weft : .22 * warp + .78 * weft;
      const fibre = .023 * Math.sin((x*5+y*3)*TAU/TILE_SIZE) * Math.cos((y*11-x*7)*TAU/TILE_SIZE);
      const at = y*TILE_SIZE+x;
      relief[at] = thread + fibre;
      light[at*4] = Math.round(175 + 76 * thread);
      light[at*4+1] = Math.round((wool ? 215 : 230) + 14 * (1-thread) + fibre * 140);
      light[at*4+3] = 255;
    }
  }
  const repeat = wool ? 108 : 57;
  const maps = {normal:normalFromRelief(relief,TILE_SIZE,repeat,.82), surface:texture(light,TILE_SIZE,repeat)};
  cloth.set(kind,maps);
  return maps;
}

function skinMaps() {
  const relief = new Float32Array(TILE_SIZE ** 2);
  let seed = 1929;
  for (let i=0; i<relief.length; i++) {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    relief[i] = (seed / 4294967296) ** 2.4;
  }
  // These islands are shared by the existing MakeHuman complexion textures.
  // Match the oily areas of the face and the pads of the palms to their UVs.
  const specularZones = [
    [.91,.515,.038,.045,.24], [.956,.515,.028,.030,.16],
    [.831,.515,.042,.059,.16],
    [.848,.463,.032,.030,.11], [.848,.565,.032,.030,.11],
    [.419,.893,.048,.069,.11], [.688,.888,.053,.070,.11],
  ];
  const size = 128;
  const gloss = new Uint8Array(size ** 2 * 4);
  for (let y=0; y<size; y++) {
    for (let x=0; x<size; x++) {
      let oil = 0;
      const u = (x+.5)/size, v = (y+.5)/size;
      for (const [cx,cy,rx,ry,strength] of specularZones) {
        const d2 = ((u-cx)/rx)**2 + ((v-cy)/ry)**2;
        oil = Math.max(oil,Math.exp(-d2*1.22)*strength);
      }
      const coarse = Math.sin(u * 137.3 + Math.cos(v * 86.7)) * Math.cos(v * 134.2 - u * 52.2);
      const at = (y*size+x)*4;
      gloss[at + 1] = Math.round(255 * (.655 - oil + coarse * .022));
      gloss[at + 3] = 255;
    }
  }
  return {normal:normalFromRelief(relief,TILE_SIZE,17,.37), roughness:texture(gloss,size)};
}

export function shadeCharacterMaterial(material) {
  if (!material?.isMeshStandardMaterial) return;
  const name = material.name;
  if (/^Human\.body(?:\.\d+)?$/i.test(name)) {
    skin ??= skinMaps();
    if (!material.normalMap) {
      material.normalMap = skin.normal;
      material.normalScale.setScalar(.23);
    }
    if (!material.roughnessMap) {
      material.roughnessMap = skin.roughness;
      material.roughness = 1;
    }
  } else if (/^Human\.low-poly(?:\.\d+)?$/i.test(name)) {
    material.roughness = .32;
  } else if (/suit|fedora|felt|cotton|apron/i.test(name)) {
    const wool = !/cotton|apron/i.test(name);
    const maps = clothMaps(wool ? 'wool' : 'cotton');
    if (!material.normalMap) {
      material.normalMap = maps.normal;
      material.normalScale.setScalar(wool ? .46 : .42);
    }
    if (!material.roughnessMap) {
      material.roughnessMap = maps.surface;
      material.roughness = 1;
    }
    if (!material.aoMap) {
      material.aoMap = maps.surface;
      material.aoMapIntensity = .23;
    }
  }
}
