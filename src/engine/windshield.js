import * as THREE from '../../vendor/three.module.min.js';
import { VIEW_EFFECTS_LAYER } from './renderer.js';
import { bar, batch, box, panel } from './vehicle-geometry.js';
import { createWiperMotion, WIPE_SAMPLES } from './windshield-motion.mjs';

const framebufferCopies = new WeakMap();
let beadTexture;

function buildBeadTexture() {
  // The texture covers 1.28 x .64 meters. Encode a droplet height and its
  // two slopes, with a different deposition threshold for each bead.
  const width = 1024, height = 512;
  const surface = new Float32Array(width * height);
  const pixels = new Uint8Array(width * height * 4);
  let seed = 1929;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1800; i++) {
    const x = Math.floor(random() * width), y = Math.floor(random() * height);
    const radius = 1.12 + 3.1 * random() ** 2.6;
    const length = radius * (.9 + random() * .60);
    const margin = Math.ceil(Math.max(radius,length));
    const threshold = Math.round((.27 + .73 * random()) * 255);
    for (let dy = -margin; dy <= margin; dy++) {
      for (let dx = -margin; dx <= margin; dx++) {
        const r2 = (dx / radius) ** 2 + (dy / length) ** 2;
        if (r2 >= 1) continue;
        const heightHere = Math.sqrt(1 - r2) * Math.min(1, radius / 2.2);
        const at = ((y + dy + height) % height) * width + (x + dx + width) % width;
        if (heightHere > surface[at]) {
          surface[at] = heightHere;
          pixels[at * 4 + 3] = threshold;
        }
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const above = ((y + 1) % height) * width;
    const below = ((y + height - 1) % height) * width;
    for (let x = 0; x < width; x++) {
      const at = (row + x) * 4;
      const dx = surface[row + (x + 1) % width] - surface[row + (x + width - 1) % width];
      const dy = surface[above + x] - surface[below + x];
      pixels[at] = Math.round(127.5 + dx * 127.5);
      pixels[at + 1] = Math.round(127.5 + dy * 127.5);
      pixels[at + 2] = Math.round(surface[row + x] * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX = `
  varying vec2 pane;
  void main() {
    pane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const FRAGMENT = `
  varying vec2 pane;
  uniform sampler2D beads;
  uniform sampler2D swept;
  uniform sampler2D street;
  uniform vec2 screenPixel;
  uniform vec2 pivots[WIPERS];
  uniform vec2 arc;
  uniform vec2 radii;
  uniform float wetness;
  uniform float time;
  uniform float pattern;
  uniform bool cabin;

  float cleared() {
    float dry = 0.;
    for (int i = 0; i < WIPERS; i++) {
      vec2 delta = pane - pivots[i];
      float angle = atan(delta.x, -delta.y);
      float radius = length(delta);
      float across = smoothstep(arc.x - .018, arc.x, angle)
        * (1. - smoothstep(arc.y, arc.y + .018, angle));
      float lengthwise = smoothstep(radii.x - .006, radii.x + .006, radius)
        * (1. - smoothstep(radii.y - .006, radii.y + .006, radius));
      float sector = clamp((angle - arc.x) / (arc.y - arc.x), 0., 1.);
      float u = mix(.5, WIPE_SAMPLES - .5, sector) / WIPE_SAMPLES;
      dry = max(dry, texture2D(swept, vec2(u, .5)).r * across * lengthwise);
    }
    return dry;
  }

  float hash(float n) {
    return fract(sin(n * 19.163) * 753.549);
  }

  vec2 runoff() {
    // Gravity pulls isolated drops through the smaller beads. Their
    // trailing film widens around the bead at the bottom of each run.
    float column = pane.x * 28. + pattern * 11.;
    float lane = floor(column);
    float seed = hash(lane + .3);
    float fall = fract(pane.y * (3.6 + seed * 2.) + seed + time * (.19 + seed * .42));
    float width = mix(.027, .095, 1. - smoothstep(.075, .22, fall));
    float path = fract(column) - (.19 + seed * .58) - sin(pane.y * 29. + lane) * .04;
    float run = (1. - smoothstep(.0, width, abs(path)))
      * smoothstep(.015, .075, fall) * (1. - smoothstep(.16, .7, fall));
    return vec2(run * smoothstep(.46, .96, seed), clamp(path / width, -1., 1.));
  }

  void main() {
    float moisture = wetness * (1. - .94 * cleared());
    vec4 bead = texture2D(beads, pane / vec2(1.28, .64) + vec2(pattern, .256));
    float grain = bead.b * smoothstep(.91 - moisture, 1.15 - moisture, bead.a) * moisture;
    vec2 run = runoff();
    float trail = run.x * moisture;
    float water = max(grain, trail);
    vec2 slope = (bead.rg * 2. - 1.) * grain + vec2(-run.y * .64, .08) * trail;
    float sparkle = max(0., slope.y - slope.x * .28);
    float shade = max(0., -slope.y + slope.x * .22);

    if (cabin) {
      // The framebuffer holds the already lit street. Keep its display
      // encoding and bend only the light behind the liquid on this pane.
      vec2 uv = gl_FragCoord.xy * screenPixel;
      vec2 bend = slope * vec2(9., 11.) * screenPixel;
      vec3 light = texture2D(street, uv + bend).rgb;
      float luminance = dot(light, vec3(.2126, .7152, .0722));
      light *= 1. - shade * .29;
      light += vec3(.62, .74, .82) * sparkle * (.23 + luminance * .57);
      light = mix(light, light * .72 + vec3(.05, .061, .076), moisture * .26);
      gl_FragColor = vec4(clamp(light, 0., 1.), min(1., .20 * moisture + 1.35 * water));
    } else {
      vec3 light = mix(vec3(.12, .17, .21), vec3(.71, .81, .86), min(1., sparkle * 2.1));
      gl_FragColor = vec4(light, min(.54, moisture * .045 + water * .51));
    }
  }
`;

function copyStreet(renderer, uniforms, size) {
  renderer.getDrawingBufferSize(size);
  let copy = framebufferCopies.get(renderer);
  if (!copy || copy.image.width !== size.x || copy.image.height !== size.y) {
    copy?.dispose();
    copy = new THREE.FramebufferTexture(size.x, size.y);
    copy.minFilter = copy.magFilter = THREE.LinearFilter;
    framebufferCopies.set(renderer, copy);
  }
  renderer.copyFramebufferToTexture(copy);
  uniforms.street.value = copy;
  uniforms.screenPixel.value.set(1 / size.x, 1 / size.y);
}

function buildWiper(frame, x, y, inner, outer, metal, enamel, i) {
  const pivot = new THREE.Group();
  pivot.name = 'Windshield wiper ' + (i + 1);
  pivot.position.set(x, y, .012);
  frame.add(pivot);
  batch(frame, [
    box(x,y+.012,.016,.047,.027,.022),
    bar([x,y,.013],[x,y,.032],.018,12),
  ],enamel,false);
  const middle = (inner + outer) * .5;
  batch(pivot, [
    bar([0,0,.019],[0,-middle,.012],.005,8),
    bar([0,-inner,.004],[0,-middle,.009],.004,7),
    bar([0,-middle,.009],[0,-outer,.004],.004,7),
    bar([0,0,.019],[0,0,.027],.011,12),
  ],metal,false);
  batch(pivot, [box(0,-middle,0,.008,outer-inner,.009)],enamel,false);
  return pivot;
}

/** Fit the glazing, droplets and mechanical sweep in the same local plane. */
export function buildWindshield(chassis, corners, profile, {metal,enamel}) {
  const origin = new THREE.Vector3(...corners[0]).lerp(new THREE.Vector3(...corners[1]), .5);
  const up = new THREE.Vector3(...corners[2]).lerp(new THREE.Vector3(...corners[3]), .5).sub(origin);
  const height = up.length();
  up.normalize();
  const xAxis = new THREE.Vector3(1,0,0);
  const glassNormal = new THREE.Vector3().crossVectors(xAxis,up);
  const frame = new THREE.Group();
  frame.name = 'Windshield frame';
  frame.position.copy(origin);
  frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis,up,glassNormal));
  chassis.add(frame);

  const {pivots, inner, outer, park, far} = profile;
  const pinHeight = height - .015;
  const blades = pivots.map((x, i) => buildWiper(frame,x,pinHeight,inner,outer,metal,enamel,i));
  for (const blade of blades) blade.rotation.z = park;

  // Parallel Packard blades share a motor; the dry sectors are sampled
  // relative to each pivot, so the center divider keeps two separate arcs.
  const motion = createWiperMotion(profile);
  const pixels = new Uint8Array(WIPE_SAMPLES);
  const swept = new THREE.DataTexture(pixels, WIPE_SAMPLES, 1, THREE.RedFormat);
  swept.magFilter = swept.minFilter = THREE.LinearFilter;
  swept.needsUpdate = true;
  beadTexture ??= buildBeadTexture();
  const uniforms = {
    beads: {value:beadTexture}, swept: {value:swept}, street: {value:null},
    screenPixel: {value:new THREE.Vector2()}, arc: {value:new THREE.Vector2(park,far)},
    radii: {value:new THREE.Vector2(inner,outer)},
    pivots: {value:pivots.map(x=>new THREE.Vector2(x,pinHeight))},
    wetness: {value:0}, time: {value:0}, cabin: {value:false},
    pattern: {value: blades.length === 1 ? .032 : .417},
  };
  const material = new THREE.ShaderMaterial({
    defines: {WIPERS:blades.length, WIPE_SAMPLES:WIPE_SAMPLES.toFixed(1)},
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
  });
  const film = new THREE.Mesh(panel(corners.map(point => {
    const relative = new THREE.Vector3(...point).sub(origin);
    return [relative.x, relative.dot(up), .0025];
  })), material);
  film.name = 'Water on windshield';
  film.visible = false;
  film.layers.set(VIEW_EFFECTS_LAYER);
  film.renderOrder = 14;
  frame.add(film);
  const size = new THREE.Vector2();
  film.onBeforeRender = (renderer) => {
    if (uniforms.cabin.value && renderer.getRenderTarget() === null) copyStreet(renderer, uniforms, size);
  };

  return {
    update(dt, rain, cabin, enabled) {
      const reversed = motion.update(dt, rain, enabled);
      for (const blade of blades) blade.rotation.z = motion.angle;
      uniforms.wetness.value = THREE.MathUtils.damp(uniforms.wetness.value,rain,rain>.03 ? 1.8 : .5,dt);
      film.visible = uniforms.wetness.value > .012;
      uniforms.cabin.value = cabin;
      if (film.visible) {
        uniforms.time.value += dt;
        let changed = false;
        for (let i = 0; i < pixels.length; i++) {
          const next = Math.round(motion.freshness[i] * 255);
          if (pixels[i] === next) continue;
          pixels[i] = next;
          changed = true;
        }
        if (changed) swept.needsUpdate = true;
      }
      return reversed;
    },
  };
}
