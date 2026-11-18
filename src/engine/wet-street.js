import * as THREE from '../../vendor/three.module.min.js';
import { VIEW_EFFECTS_LAYER } from './renderer.js';
import { ROAD_HEIGHT } from './street-layout.js';

const reflectionShader = `
uniform sampler2D wetStreetImage;
uniform mat4 wetStreetProjection;
uniform float wetStreetAmount;
uniform float wetStreetVisibility;
uniform float wetStreetRain;
uniform float wetStreetTime;

float wetStreetHash(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float wetStreetNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 weight = f * f * (3.0 - 2.0 * f);
  return mix(mix(wetStreetHash(cell), wetStreetHash(cell + vec2(1,0)), weight.x),
             mix(wetStreetHash(cell + vec2(0,1)), wetStreetHash(cell + vec2(1)), weight.x), weight.y);
}

float wetStreetHollow(vec2 p, vec2 center, vec2 radius) {
  vec2 q = (p - center) / radius;
  return 1.0 - smoothstep(.08, 1.0, dot(q, q));
}

vec2 wetStreetRipple(vec2 p) {
  vec2 cell = floor(p);
  vec2 seed = vec2(wetStreetHash(cell + 4.2), wetStreetHash(cell - 3.7));
  vec2 fromDrop = fract(p) - mix(vec2(.34), vec2(.66), seed);
  float distanceToDrop = length(fromDrop);
  float age = fract(wetStreetTime * (.82 + .7 * seed.x) + seed.y);
  float distanceToRing = distanceToDrop - .32 * age;
  float crest = sin(distanceToRing * 89.0) * (1.0 - smoothstep(.015, .075, abs(distanceToRing)));
  return fromDrop / max(.015, distanceToDrop) * crest * sin(age * 3.14159) * (1.0 - age);
}

vec3 wetStreetRadiance(vec3 base, vec3 world) {
  vec2 p = world.xz;
  float block = (1.0 - smoothstep(10.55, 11.0, abs(p.x)))
    * smoothstep(1.0, 10.5, p.y) * (1.0 - smoothstep(53.0, 64.0, p.y));
  if (block < .004) return base;
  vec4 project = wetStreetProjection * vec4(world, 1.0);
  if (project.w <= 0.0) return base;
  vec2 uv = project.xy / project.w * .5 + .5;
  vec2 margin = min(uv, 1.0 - uv);
  float rim = smoothstep(.002, .028, min(margin.x, margin.y));
  if (rim < .004) return base;

  float grain = wetStreetNoise(p * vec2(3.1, 1.9));
  float coarse = wetStreetNoise(p * vec2(.76, .45));
  float gutter = (1.0 - smoothstep(.12, 1.65, abs(abs(p.x) - 9.74))) * (.22 + coarse * .53);
  float hollow = max(gutter, wetStreetHollow(p, vec2(9.2, 40.5), vec2(1.55, 6.1)));
  hollow = max(hollow, wetStreetHollow(p, vec2(6.8, 33.4), vec2(2.3, 5.8)));
  hollow = max(hollow, wetStreetHollow(p, vec2(-7.8, 30.2), vec2(2.4, 8.0)));
  hollow = max(hollow, wetStreetHollow(p, vec2(-6.5, 47.5), vec2(2.0, 6.1)));
  hollow = max(hollow, wetStreetHollow(p, vec2(9.3, 17.8), vec2(1.5, 5.0)));
  hollow = max(hollow, wetStreetHollow(p, vec2(-1.1, 18.6), vec2(1.8, 3.8)));
  hollow = max(hollow, wetStreetHollow(p, vec2(3.3, 46.8), vec2(2.7, 4.6)));
  float waterline = mix(1.08, .40, wetStreetAmount);
  float pool = smoothstep(waterline - .09, waterline + .09, hollow + .32 * (coarse - .5) + .14 * (grain - .5));

  vec3 towardEye = cameraPosition - world;
  float distanceToEye = length(towardEye);
  float grazing = 1.0 - clamp(towardEye.y / max(.1, distanceToEye), 0.0, 1.0);
  float fresnel = .045 + .955 * pow(grazing, 4.0);
  float sheen = wetStreetAmount * wetStreetAmount * (.08 + .15 * coarse);
  float strength = (sheen + .81 * pool) * fresnel * block * rim * wetStreetVisibility;
  vec2 warp = vec2(grain - .5, coarse - .5) * mix(.017, .003, pool);
  if (pool > .01 && wetStreetRain > .01) {
    vec2 ripples = wetStreetRipple(p * 2.7) + wetStreetRipple(p * 2.7 + vec2(.53, .67));
    warp += ripples * (.008 * wetStreetRain * pool * (1.0 - smoothstep(9.0, 32.0, distanceToEye)));
  }
  vec3 city = textureLod(wetStreetImage, uv + warp, mix(2.75, .15, pool)).rgb;
  return mix(base, city, strength);
}
`;

/** Project one mirrored view of 20th Street into the wet asphalt before tone mapping. */
export function createWetStreet(renderer, asphalt) {
  const hdr = renderer.extensions.has('EXT_color_buffer_float')
    || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true,
  });
  const image = {value: null};
  const projection = {value: new THREE.Matrix4()};
  const amount = {value: 0};
  const visibility = {value: 0};
  const rain = {value: 0};
  const time = {value: 0};
  const mapAsphalt = asphalt.onBeforeCompile;
  const asphaltProgram = asphalt.customProgramCacheKey();
  asphalt.onBeforeCompile = function(shader, renderer) {
    mapAsphalt.call(this, shader, renderer);
    Object.assign(shader.uniforms, {
      wetStreetImage: image, wetStreetProjection: projection,
      wetStreetAmount: amount, wetStreetVisibility: visibility,
      wetStreetRain: rain, wetStreetTime: time,
    });
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\n' + reflectionShader).replace('#include <opaque_fragment>', [
      'if (wetStreetVisibility > .001 && abs(mcWorldPos.y - ' + ROAD_HEIGHT.toFixed(3) + ') < .001) {',
      '  outgoingLight = wetStreetRadiance(outgoingLight, mcWorldPos);',
      '}',
      '#include <opaque_fragment>',
    ].join('\n'));
  };
  asphalt.customProgramCacheKey = () => asphaltProgram + ':wetStreet';

  const mirror = new THREE.PerspectiveCamera();
  const direction = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const viewport = new THREE.Vector2();
  const mainProjection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const span = new THREE.Box3(new THREE.Vector3(-11, ROAD_HEIGHT - .01, 1),
    new THREE.Vector3(11, ROAD_HEIGHT + .01, 64));
  const up = new THREE.Vector3(0, 1, 0);
  const clipPoint = new THREE.Vector3(0, ROAD_HEIGHT + .003, 0);
  const clipPlane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const corner = new THREE.Vector4();
  const smoothstep = THREE.MathUtils.smoothstep;
  const capturedEye = new THREE.Vector3();
  const capturedAim = new THREE.Quaternion();
  const capturedLens = new THREE.Matrix4();
  let sinceCapture = Infinity;

  function capture(scene, camera, wetness, rainfall, dt) {
    // The road also renders from probe cameras. Keep its reflection sampler unbound until
    // the main view is ready, especially while drawing into this texture.
    finish();
    time.value += dt;
    sinceCapture += dt;
    if (wetness < .08) return;
    camera.updateMatrixWorld();
    const {x, y, z} = camera.position;
    if (y < ROAD_HEIGHT + .12) return;
    const nearby = (1 - smoothstep(Math.abs(x), 28, 44))
      * smoothstep(z, -25, -12) * (1 - smoothstep(z, 70, 88)) * (1 - smoothstep(y, 7, 14));
    if (nearby < .01) return;
    mainProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!frustum.setFromProjectionMatrix(mainProjection).intersectsBox(span)) return;

    renderer.getDrawingBufferSize(viewport);
    const scale = Math.min(.43, 760 / Math.max(viewport.x, viewport.y));
    const width = Math.max(1, Math.round(viewport.x * scale));
    const height = Math.max(1, Math.round(viewport.y * scale));
    const cameraMoved = capturedEye.distanceToSquared(camera.position) > .29 ** 2
      || Math.abs(capturedAim.dot(camera.quaternion)) < .99965;
    // Reproject the last capture for a frame on small camera moves. Refresh immediately
    // on a fast pan, a change of view, or a resize.
    if (sinceCapture >= .031 || cameraMoved || !capturedLens.equals(camera.projectionMatrix)
        || width !== target.width || height !== target.height) {
      if (!renderReflection(scene, camera, width, height)) return;
      sinceCapture = 0;
      capturedEye.copy(camera.position);
      capturedAim.copy(camera.quaternion);
      capturedLens.copy(camera.projectionMatrix);
    }

    image.value = target.texture;
    amount.value = wetness;
    visibility.value = nearby * smoothstep(wetness, .08, .34);
    rain.value = rainfall;
  }

  function renderReflection(scene, camera, width, height) {
    const {x, y, z} = camera.position;
    mirror.position.set(x, 2 * ROAD_HEIGHT - y, z);
    direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
    mirror.up.set(0, 1, 0).transformDirection(camera.matrixWorld);
    direction.y *= -1;
    mirror.up.y *= -1;
    mirror.lookAt(aim.copy(mirror.position).add(direction));
    mirror.updateMatrixWorld();
    mirror.layers.mask = camera.layers.mask;
    mirror.layers.disable(VIEW_EFFECTS_LAYER);
    mirror.projectionMatrix.copy(camera.projectionMatrix);

    // Tilt the near plane to lie just above the road so it cannot hide its own reflection.
    clipPlane.setFromNormalAndCoplanarPoint(up, clipPoint).applyMatrix4(mirror.matrixWorldInverse);
    clip.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
    corner.set(Math.sign(clip.x), Math.sign(clip.y), 1, 1).applyMatrix4(camera.projectionMatrixInverse);
    const denominator = clip.dot(corner);
    if (denominator <= 1e-5) return false;
    clip.multiplyScalar(2 / denominator);
    const m = mirror.projectionMatrix.elements;
    m[2] = clip.x - m[3];
    m[6] = clip.y - m[7];
    m[10] = clip.z - m[11];
    m[14] = clip.w - m[15];
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    target.setSize(width, height);
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel();
    const xr = renderer.xr.enabled;
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeeded = renderer.shadowMap.needsUpdate;
    try {
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(target);
      renderer.render(scene, mirror);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadowUpdate;
      renderer.shadowMap.needsUpdate = shadowNeeded;
    }
    projection.value.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);
    return true;
  }

  function finish() {
    visibility.value = 0;
    image.value = null;
  }

  return {capture, finish};
}
