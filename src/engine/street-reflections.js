import * as THREE from '../../vendor/three.module.min.js';

const SIZE = 64;
const CENTRE = [0, 2.25, 31];
const BOX_LOW = [-20, -.15, -3];
const BOX_HIGH = [20, 28, 60];

function glslVector(values) {
  return 'vec3(' + values.map(value => value.toFixed(2)).join(', ') + ')';
}

const localRadiance = `
  vec3 streetRay(vec3 ray, vec3 position) {
    vec3 safeRay = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), ray)) * max(abs(ray), vec3(.001));
    vec3 farWall = max((${glslVector(BOX_LOW)} - position) / safeRay,
                       (${glslVector(BOX_HIGH)} - position) / safeRay);
    float hit = min(farWall.x, min(farWall.y, farWall.z));
    return position + max(hit, 0.0) * ray - ${glslVector(CENTRE)};
  }
  uniform sampler2D streetEnvMap;
  uniform float streetAmount;
  varying vec3 vStreetWorld;
` + THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
  'return envMapColor.rgb * envMapIntensity;',
  `
    float weight = streetAmount * (1.0 - smoothstep(19., 25., abs(vStreetWorld.x)))
      * smoothstep(1., 10., vStreetWorld.z) * (1.0 - smoothstep(51., 58., vStreetWorld.z))
      * (1.0 - smoothstep(8., 15., vStreetWorld.y));
    if (weight > .001) {
      vec3 ray = streetRay(reflectVec, vStreetWorld);
      vec3 localColor = textureCubeUV(streetEnvMap, ray, roughness).rgb;
      envMapColor.rgb = mix(envMapColor.rgb, localColor, weight);
    }
    return envMapColor.rgb * envMapIntensity;
  `,
);

/** Captures the actual first block for specular reflections, keeping the sky probe for diffuse fill. */
export function createStreetReflection(renderer) {
  if (!renderer.extensions.has('EXT_color_buffer_float')
      && !renderer.extensions.has('EXT_color_buffer_half_float')) return null;
  const width = SIZE * 4, height = SIZE * 2;
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
  const sky = generator.fromEquirectangular(texture);
  const street = generator.fromEquirectangular(texture);
  texture.dispose();

  const cube = new THREE.WebGLCubeRenderTarget(SIZE, {type: THREE.HalfFloatType});
  const camera = new THREE.CubeCamera(.2, 215, cube);
  camera.position.set(...CENTRE);
  camera.coordinateSystem = renderer.coordinateSystem;
  camera.updateCoordinateSystem();
  camera.updateMatrixWorld();
  const excluded = new Set();
  const amount = {value:0};
  let captured = null, capturePhase = null, face = 0, cooldown = 0;

  function reflect(material) {
    material.onBeforeCompile = shader => {
      shader.uniforms.streetEnvMap = {value:street.texture};
      shader.uniforms.streetAmount = amount;
      shader.vertexShader = 'varying vec3 vStreetWorld;\n' + shader.vertexShader.replace(
        '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStreetWorld = worldPosition.xyz;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <envmap_physical_pars_fragment>', localRadiance,
      );
    };
    return material;
  }

  function update(scene, position, phase, dt) {
    if (Math.abs(position.x) > 45 || position.y > 15 || position.z < -14 || position.z > 72) {
      capturePhase = null;
      return;
    }
    if (captured !== null) amount.value = Math.min(1, amount.value + 2 * dt);
    cooldown -= dt;
    if (cooldown > 0) return;
    if (capturePhase === null) {
      const delta = Math.abs(phase - captured);
      if (captured !== null && Math.min(delta, 1 - delta) < .055) return;
      capturePhase = phase;
      face = 0;
    }
    cooldown = .055;
    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const xr = renderer.xr.enabled;
    const shadows = renderer.shadowMap.autoUpdate;
    const blend = amount.value;
    const visible = [...excluded].filter(object => object.visible);
    try {
      for (const object of visible) object.visible = false;
      amount.value = 0;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(cube, face);
      renderer.render(scene, camera.children[face]);
      face++;
      if (face === 6) {
        generator.fromCubemap(cube.texture, street);
        captured = capturePhase;
        capturePhase = null;
        sky.texture.userData.streetCapture = captured;
      }
    } finally {
      renderer.setRenderTarget(target, cubeFace, mip);
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadows;
      amount.value = blend;
      for (const object of visible) object.visible = true;
    }
  }

  return {environment:sky.texture, reflect, exclude:object=>excluded.add(object), update};
}
