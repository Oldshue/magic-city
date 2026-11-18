/** World-space droplets and wakes emitted by the rolling tire contacts. */
import { puddleShader, PUDDLE_BOUNDS } from '../engine/puddle-field.mjs';
import { ROAD_HEIGHT } from '../engine/street-layout.js';
import { VIEW_EFFECTS_LAYER } from '../engine/renderer.js';
import { getAudio, makeNoiseBuffer, makeRng, onReady } from './audioBus.js';

const CAPACITY = 640;
const DROP = 0, MIST = 1, WAKE = 2;
const MIN_ROLL = .8;
const SAMPLE_SPACING = .14;
const WORLD_RANGE = 36;
const WATER_SURFACE = ROAD_HEIGHT + .006;
const ATTRIBUTES = [['waterCenter',3],['waterAxis',3],['waterShape',4],['waterLight',3],['waterSeed',1]];

const vertexShader = `
attribute vec3 waterCenter;
attribute vec3 waterAxis;
attribute vec4 waterShape;
attribute vec3 waterLight;
attribute float waterSeed;
varying vec2 mark;
varying vec2 onRoad;
varying vec4 appearance;
varying vec3 illumination;
varying float seed;

void main() {
  mark = position.xy * 2.;
  appearance = waterShape;
  illumination = waterLight;
  seed = waterSeed;
  if (waterShape.w > 1.5) {
    vec2 along = waterAxis.xz;
    vec2 across = vec2(along.y, -along.x);
    vec2 offset = across * position.x * waterShape.x + along * position.y * waterShape.y;
    onRoad = waterCenter.xz + offset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(onRoad.x, waterCenter.y, onRoad.y, 1.);
  } else {
    onRoad = waterCenter.xz;
    vec3 inView = (modelViewMatrix * vec4(waterCenter, 1.)).xyz;
    vec2 movement = (mat3(modelViewMatrix) * waterAxis).xy;
    vec2 along = normalize(movement + vec2(0., .001));
    vec2 across = vec2(along.y, -along.x);
    inView.xy += across * position.x * waterShape.x + along * position.y * waterShape.y;
    gl_Position = projectionMatrix * vec4(inView, 1.);
  }
}
`;

const fragmentShader = `
varying vec2 mark;
varying vec2 onRoad;
varying vec4 appearance;
varying vec3 illumination;
varying float seed;
uniform float wetness;
${puddleShader}

void main() {
  float alpha;
  float bright = 1.;
  if (appearance.w < .5) {
    float tip = .15 + .56 * (1. - smoothstep(-.8, 1., mark.y));
    float width = 1. - smoothstep(tip * .21, tip, abs(mark.x));
    alpha = width * smoothstep(-1., -.49, mark.y) * (1. - smoothstep(.38, 1., mark.y));
    bright = .69 + .68 * smoothstep(-.25, .72, mark.y) + .22 * seed;
  } else if (appearance.w < 1.5) {
    float r = length(mark * vec2(1., .92));
    float billow = .72 + .28 * sin((mark.x * 2.5 + mark.y + seed) * 6.8)
      * sin((mark.y * 2.1 - mark.x + seed) * 5.7);
    alpha = pow(1. - smoothstep(.06, 1., r), 1.6) * billow;
    bright = .83;
  } else {
    vec2 ripple = mark + .085 * sin(mark.yx * vec2(7.1, 5.3) + seed * 19.);
    float crest = 1. - smoothstep(.018, .14, abs(length(ripple) - .74));
    float turbulence = sin((mark.x + .39 * mark.y + seed) * 17.)
      * sin((mark.y - .24 * mark.x + seed * 1.7) * 10.);
    float broken = .14 + .86 * smoothstep(-.26, .61, turbulence);
    float pool = wetStreetBlock(onRoad) * wetStreetPool(onRoad, wetness);
    alpha = crest * broken * smoothstep(-.80, .08, mark.y) * smoothstep(.03, .5, pool);
    bright = .78 + .44 * broken;
  }
  gl_FragColor = vec4(illumination * bright, alpha * appearance.z);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeWaterMesh(THREE, scene, puddles) {
  const quad = new THREE.PlaneGeometry(1,1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.index);
  geometry.setAttribute('position',quad.attributes.position);
  for (const [name, size] of ATTRIBUTES) {
    geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * size),size)
      .setUsage(THREE.DynamicDrawUsage));
  }
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
    uniforms:{wetStreetField:{value:puddles.texture}, wetness:{value:0}},
  });
  const mesh = new THREE.Mesh(geometry,material);
  mesh.name = 'Tire spray and wakes';
  mesh.layers.set(VIEW_EFFECTS_LAYER);
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

export function startTireWater(ctx, driving, traffic) {
  const { THREE, scene, camera, puddles, deco, getDayPhase } = ctx;
  const mesh = makeWaterMesh(THREE,scene,puddles);
  const attrs = mesh.geometry.attributes;
  const { minX, maxX, minZ, maxZ } = PUDDLE_BOUNDS;
  const lamps = deco.initLampPool(scene);
  const contacts = new WeakMap();
  const particles = Array.from({length:CAPACITY},()=>({life:0}));
  const light = new THREE.Color();
  const rng = makeRng(0x19290a71);
  const { lerp, smoothstep } = THREE.MathUtils;
  let dt = 0, wetness = 0, frame = 0, cursor = 0, night = 0;
  let hiss = 0, hissPitch = 0, audio;

  onReady(() => {
    const bus = getAudio();
    if (!bus) return;
    const ac = bus.ctx;
    const source = ac.createBufferSource();
    source.buffer = makeNoiseBuffer(ac,2.4,makeRng(0x19c029));
    source.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 850;
    filter.Q.value = .57;
    const gain = ac.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(bus.master);
    source.start();
    audio = {ac,filter,gain};
  });

  function lightAt(x,z) {
    light.setRGB(lerp(.47,.115,night),lerp(.53,.153,night),lerp(.59,.206,night));
    for (const lamp of lamps) {
      if (lamp.intensity <= 0) continue;
      const r2 = (x-lamp.position.x)**2 + lamp.position.y**2 + (z-lamp.position.z)**2;
      const reach = 1 - r2 / (lamp.distance * lamp.distance);
      if (reach > 0) {
        const strength = Math.min(.72,lamp.intensity / Math.max(7,r2) * .38) * reach * reach;
        light.r += lamp.color.r * strength;
        light.g += lamp.color.g * strength;
        light.b += lamp.color.b * strength;
      }
    }
  }

  function startParticle(kind,x,z,fx,fz,side,speed,water) {
    const p = particles[cursor];
    cursor = (cursor + 1) % CAPACITY;
    const sideX = fz * side, sideZ = -fx * side;
    const burst = smoothstep(speed,2.1,13);
    p.kind = kind;
    p.x = x;
    p.y = WATER_SURFACE;
    p.z = z;
    p.age = 0;
    p.seed = rng();
    p.r = light.r;
    p.g = light.g;
    p.b = light.b;
    if (kind === WAKE) {
      p.vx = sideX * .37 - fx * .93;
      p.vy = 0;
      p.vz = sideZ * .37 - fz * .93;
      p.size = (.19 + burst * .25) * (.64 + .36 * water) * (.83 + .36 * p.seed);
      p.life = .37 + .22 * burst + .12 * p.seed;
      p.opacity = (.083 + .19 * burst) * Math.sqrt(water);
    } else if (kind === MIST) {
      p.x += sideX * .13 - fx * .16;
      p.z += sideZ * .13 - fz * .16;
      p.y += .065;
      p.vx = (sideX * (.085 + .09 * rng()) - fx * .18) * speed;
      p.vz = (sideZ * (.085 + .09 * rng()) - fz * .18) * speed;
      p.vy = .24 + burst * .48;
      p.size = .20 + burst * .28;
      p.life = .38 + .36 * burst;
      p.opacity = (.095 + .165 * burst) * water;
    } else {
      const treadOffset = .077 + rng() * .071;
      p.x += sideX * treadOffset - fx * .09;
      p.z += sideZ * treadOffset - fz * .09;
      p.y += .021 + rng() * .04;
      const back = (.067 + .30 * rng()) * speed;
      const out = (.105 + .26 * rng()) * speed * (.64 + .36 * water);
      p.vx = sideX * out - fx * back;
      p.vz = sideZ * out - fz * back;
      p.vy = (.075 + .197 * rng()) * speed * (.51 + .49 * water);
      p.size = .012 + .026 * rng() ** 2.3;
      p.life = .57 + .18 * rng();
      p.opacity = (.34 + .36 * rng()) * (.54 + .46 * water);
    }
  }

  function roll(car,model,cabin = false) {
    const speed = Math.abs(car.speed);
    if (wetness < .08 || dt <= 0 || speed < MIN_ROLL
      || car.x < minX - 2 || car.x > maxX + 2 || car.z < minZ - 3 || car.z > maxZ + 3
      || (camera.position.x - car.x)**2 + (camera.position.z - car.z)**2 > WORLD_RANGE**2) return;
    let history = contacts.get(car);
    if (!history) {
      history = model.wheels.map(()=>({frame:-2, drops:0, ripples:0, rippleStep:.46, inPool:false}));
      contacts.set(car,history);
    }
    const sine = Math.sin(car.heading), cosine = Math.cos(car.heading);
    const sign = Math.sign(car.speed);
    const power = smoothstep(speed,MIN_ROLL,8.5);
    let audibleWater = 0;

    for (let i = 0; i < model.wheels.length; i++) {
      const wheel = model.wheels[i], path = history[i];
      const x = car.x + wheel.x * cosine + wheel.z * sine;
      const z = car.z - wheel.x * sine + wheel.z * cosine;
      const yaw = car.heading + wheel.holder.rotation.y;
      const fx = Math.sin(yaw) * sign, fz = Math.cos(yaw) * sign;
      const side = Math.sign(wheel.x) * sign;
      const continuous = path.frame === frame - 1;
      const fromX = continuous ? path.x : x - fx * speed * dt;
      const fromZ = continuous ? path.z : z - fz * speed * dt;
      path.frame = frame;
      path.x = x;
      path.z = z;
      const travel = Math.hypot(x-fromX,z-fromZ);
      const onRoad = model.ride.support[i] <= .054 && travel <= speed * dt * 2 + .24;
      if (!continuous || !onRoad) {
        path.drops = path.ripples = 0;
        path.inPool = false;
      }
      if (!onRoad || travel < .001) continue;

      const steps = Math.ceil(travel / SAMPLE_SPACING);
      const spacing = travel / steps;
      let deepest = 0;
      for (let step = 0; step < steps; step++) {
        const fraction = (step + .5) / steps;
        const px = lerp(fromX,x,fraction), pz = lerp(fromZ,z,fraction);
        const depth = puddles.sample(px,pz,wetness);
        if (depth < .035) {
          path.inPool = false;
          path.drops = path.ripples = 0;
          continue;
        }
        deepest = Math.max(deepest,depth);
        path.drops += spacing * (2.4 + 12.7 * Math.sqrt(depth)) * power;
        path.ripples += spacing * depth;
        const firstSplash = depth > .55 && !path.inPool && power > .24;
        if (firstSplash) {
          path.inPool = true;
          path.drops += 2 + 4 * power;
        }
        const wake = depth > .13 && path.ripples >= path.rippleStep;
        if (path.drops < 1 && !wake) continue;

        lightAt(px,pz);
        while (path.drops >= 1) {
          startParticle(DROP,px,pz,fx,fz,side,speed,depth);
          path.drops--;
        }
        if (wake) {
          startParticle(WAKE,px,pz,fx,fz,side,speed,depth);
          if (power > .31 && depth > .28) startParticle(MIST,px,pz,fx,fz,side,speed,depth);
          path.ripples -= path.rippleStep;
          path.rippleStep = .32 + rng() * .29;
        }
      }
      audibleWater += deepest;
    }

    const distance = Math.hypot(car.x-camera.position.x,car.z-camera.position.z);
    const level = Math.sqrt(audibleWater / model.wheels.length) * power
      * (1 - smoothstep(distance,3,23)) * (cabin ? .59 : 1);
    if (level > hiss) {
      hiss = level;
      hissPitch = cabin ? 580 + speed * 25 : 870 + Math.min(17,speed) * 49;
    }
  }

  function finishFrame() {
    let count = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.life = 0;
        continue;
      }
      const progress = p.age / p.life;
      let width, length, fade;
      if (p.kind === WAKE) {
        width = p.size * (1 + 1.8 * progress);
        length = width * (1.01 + .49 * p.seed);
        fade = smoothstep(progress,0,.13) * (1-progress)**1.47;
      } else {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        if (p.kind === MIST) {
          p.y += p.vy * dt;
          width = p.size * (1 + 1.8 * progress);
          length = width * 1.40;
          fade = smoothstep(progress,0,.18) * (1-progress)**1.51;
        } else {
          p.y += (p.vy - 4.905 * dt) * dt;
          p.vy -= 9.81 * dt;
          if (p.y <= WATER_SURFACE) {
            p.life = 0;
            continue;
          }
          width = p.size;
          length = width + Math.hypot(p.vx,p.vy,p.vz) * .024;
          fade = 1 - progress * .80;
        }
      }
      attrs.waterCenter.setXYZ(count,p.x,p.y,p.z);
      attrs.waterAxis.setXYZ(count,p.vx,p.vy,p.vz);
      attrs.waterShape.setXYZW(count,width,length,p.opacity*fade,p.kind);
      attrs.waterLight.setXYZ(count,p.r,p.g,p.b);
      attrs.waterSeed.setX(count,p.seed);
      count++;
    }
    mesh.geometry.instanceCount = count;
    mesh.visible = count > 0;
    if (count) {
      for (const [name] of ATTRIBUTES) attrs[name].needsUpdate = true;
    }
    if (audio) {
      const t = audio.ac.currentTime;
      audio.gain.gain.setTargetAtTime(hiss * .26,t,.12);
      if (hissPitch) audio.filter.frequency.setTargetAtTime(hissPitch,t,.15);
    }
  }

  return {
    update(delta,amount) {
      dt = delta;
      wetness = amount;
      frame++;
      hiss = hissPitch = 0;
      const phase = getDayPhase();
      night = Math.max(1-smoothstep(phase,.12,.27),smoothstep(phase,.74,.9));
      mesh.material.uniforms.wetness.value = wetness;
      if (wetness >= .08) {
        driving?.emitTireWater(roll);
        traffic?.emitTireWater(roll);
      }
      finishFrame();
    },
  };
}
