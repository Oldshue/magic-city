import * as THREE from '../../vendor/three.module.min.js';

/** A compact light probe for new lacquer, glass, and polished metal. */
export function createStreetReflection(renderer) {
  if (!renderer.extensions.has('EXT_color_buffer_float')
      && !renderer.extensions.has('EXT_color_buffer_half_float')) return null;
  const width = 192, height = 96;
  const values = new Uint16Array(width * height * 4);
  const half = THREE.DataUtils.toHalfFloat;
  for (let y = 0; y < height; y++) {
    const latitude = (y / (height - 1) - 0.5) * Math.PI;
    const altitude = Math.sin(latitude);
    for (let x = 0; x < width; x++) {
      const azimuth = x / width * Math.PI * 2;
      const key = Math.max(0, Math.cos(azimuth - 0.9) * Math.cos(latitude - .65));
      const ground = altitude < -.12;
      const ridge = .20 + .16 * (Math.cos(azimuth * 3) * .5 + .5);
      const skyline = altitude > -.08 && altitude < ridge;
      const sky = THREE.MathUtils.smoothstep(altitude, -.12, .98);
      const softbox = 3.6 * key ** 20 + 11 * key ** 180;
      const shade = skyline ? .32 : .82;
      const hue = ground ? [.18,.15,.12] : [
        (.88 + .16 * sky) * shade, (1.01 + .26 * sky) * shade, (1.15 + .55 * sky) * shade,
      ];
      const i = (y * width + x) * 4;
      values[i] = half(hue[0] + softbox);
      values[i + 1] = half(hue[1] + softbox * .91);
      values[i + 2] = half(hue[2] + softbox * .81);
      values[i + 3] = half(1);
    }
  }
  const texture = new THREE.DataTexture(values, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const probe = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  return probe.texture;
}
