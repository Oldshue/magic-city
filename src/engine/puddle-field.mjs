// Height variation in the road is shared by the reflection shader and tires.
// Pixel centers and bilinear filtering match the red texture sampled on the GPU.
export const PUDDLE_BOUNDS = {minX:-11, maxX:11, minZ:1, maxZ:64};
const {minX, maxX, minZ, maxZ} = PUDDLE_BOUNDS;
const innerEdge = 10.55, northFade = 10.5, southFade = 53;
const spanX = maxX - minX, spanZ = maxZ - minZ;
const width = 256, height = 640;
const heightScale = 1.5, heightOffset = -.25;
const dryLine = 1.08, wetLine = .4, feather = .09;
const pockets = [
  [9.2, 40.5, 1.55, 6.1],
  [6.8, 33.4, 2.3, 5.8],
  [-7.8, 30.2, 2.4, 8.0],
  [-6.5, 47.5, 2.0, 6.1],
  [9.3, 17.8, 1.5, 5.0],
  [-1.1, 18.6, 1.8, 3.8],
  [3.3, 46.8, 2.7, 4.6],
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fract = v => v - Math.floor(v);
const mix = (a, b, t) => a + (b - a) * t;
const fade = v => v * v * (3 - 2 * v);
const smooth = (lo, hi, v) => fade(clamp((v - lo) / (hi - lo), 0, 1));

function hash(x, z) {
  const a = fract(x * .1031), b = fract(z * .1031);
  const cross = a * (b + 33.33) + b * (a + 33.33) + a * (a + 33.33);
  return fract((a + b + 2 * cross) * (a + cross));
}

function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const u = fade(x - i), v = fade(z - j);
  return mix(mix(hash(i, j), hash(i + 1, j), u), mix(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

function roadHollow(x, z) {
  const coarse = noise(x * .76, z * .45);
  const grain = noise(x * 3.1, z * 1.9);
  let hollow = (1 - smooth(.12, 1.65, Math.abs(Math.abs(x) - 9.74))) * (.22 + coarse * .53);
  for (const [cx, cz, rx, rz] of pockets) {
    const r2 = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    hollow = Math.max(hollow, 1 - smooth(.08, 1, r2));
  }
  return hollow + .32 * (coarse - .5) + .14 * (grain - .5);
}

export const puddleShader = `
uniform sampler2D wetStreetField;

float wetStreetBlock(vec2 p) {
  return (1.0 - smoothstep(${innerEdge}, ${maxX.toFixed(1)}, abs(p.x)))
    * smoothstep(${minZ.toFixed(1)}, ${northFade}, p.y)
    * (1.0 - smoothstep(${southFade.toFixed(1)}, ${maxZ.toFixed(1)}, p.y));
}

float wetStreetPool(vec2 p, float wetness) {
  vec2 uv = (p - vec2(${minX.toFixed(1)}, ${minZ.toFixed(1)})) / vec2(${spanX.toFixed(1)}, ${spanZ.toFixed(1)});
  float hollow = texture2D(wetStreetField, uv).r * ${heightScale} - ${Math.abs(heightOffset)};
  float line = mix(${dryLine}, ${wetLine}, wetness);
  return smoothstep(line - ${feather}, line + ${feather}, hollow);
}
`;

export function createPuddleField() {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const z = minZ + (y + .5) * spanZ / height;
    for (let x = 0; x < width; x++) {
      const hollow = roadHollow(minX + (x + .5) * spanX / width, z);
      pixels[y * width + x] = Math.round(clamp((hollow - heightOffset) / heightScale, 0, 1) * 255);
    }
  }

  function sample(x, z, wetness) {
    if (wetness < .08 || Math.abs(x) >= maxX || z <= minZ || z >= maxZ) return 0;
    const block = (1 - smooth(innerEdge, maxX, Math.abs(x)))
      * smooth(minZ, northFade, z) * (1 - smooth(southFade, maxZ, z));
    const u = clamp((x - minX) * width / spanX - .5, 0, width - 1);
    const v = clamp((z - minZ) * height / spanZ - .5, 0, height - 1);
    const i = Math.floor(u), j = Math.floor(v);
    const right = Math.min(i + 1, width - 1), next = Math.min(j + 1, height - 1);
    const low = mix(pixels[j * width + i], pixels[j * width + right], u - i);
    const high = mix(pixels[next * width + i], pixels[next * width + right], u - i);
    const hollow = mix(low, high, v - j) * heightScale / 255 + heightOffset;
    const line = mix(dryLine, wetLine, wetness);
    return block * smooth(line - feather, line + feather, hollow);
  }

  return {width, height, pixels, sample};
}
