/**
 * driving.js — makes Magic City 1929 drivable: 4-6 parked period sedans at
 * plausible downtown/terminal-quarter curbs, walk-up "Press E to drive"
 * boarding, arcade car physics (throttle/brake/steer/gentle drift, ~50 km/h
 * cap, friction, AABB collision against the walking controller's colliders),
 * a chase-cam driving view, warm night headlights, a synthesized two-tone
 * horn (H), a throttle-linked engine putter, and streetcar boarding/riding
 * coordinated through the additive `streetcars.getCars()` hook (no reaching
 * into streetcar internals). Registers with the engine loop per
 * docs/TECH-CONTRACT.md: startDriving(ctx) -> { update(dt, elapsed) }.
 *
 * Camera ownership: while driving or riding, this module calls
 * ctx.controls.setEnabled(false) so the walking controller's own W/A/S/D
 * handling steps aside, and writes camera.position/rotation directly every
 * frame; setEnabled(true) hands the camera back on exit.
 *
 * No existing "Press E to prompt" HUD was found in the repo (src/narrative/
 * does not exist yet), so this module owns a small self-contained prompt
 * element rather than reaching into a nonexistent pathway.
 */
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { EYE_HEIGHT } from '../engine/controls.js';

// --- Arcade physics tuning ---------------------------------------------
const MAX_SPEED = 22;        // ~80 km/h
const MAX_REVERSE = -6;      // m/s
const ACCEL = 9;             // m/s^2 forward
const REVERSE_ACCEL = 4.2;   // m/s^2 reverse
const BRAKE_DECEL = 11;      // m/s^2 braking while moving forward
const FRICTION_DECEL = 3.4;  // m/s^2 coasting to a stop
const MAX_STEER_RATE = 1.9;  // rad/s at low speed
const MIN_STEER_RATE = 0.55; // rad/s at max speed
const DRIFT_LAG = 5.5;       // higher = velocity snaps to heading faster (less drift)
const CAR_RADIUS = 2.6;      // collision padding, roughly a sedan's half-diagonal
const CHASE_DIST = 6.8;
const CHASE_HEIGHT = 2.9;
const EXIT_OFFSET = 2.6;

// --- Boarding tuning ------------------------------------------------------
const CAR_PROMPT_RADIUS = 2.5;
const TRAM_PROMPT_RADIUS = 3.2;
const RIDE_SIDE = 1.9;
const RIDE_HEIGHT = 1.95;
const EXIT_TRAM_OFFSET = 3.4;

const EMPTY_BOXES = [];

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function isNight(phase) { return phase < 0.22 || phase > 0.8; }

function boxHit(boxes, x, z, radius) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) {
      return true;
    }
  }
  return false;
}

// Parked-sedan spawn list: plausible curbs along downtown avenues and the
// terminal quarter, parallel-parked (long axis along the street they sit on).
const SEDAN_SPECS = [
  { x: 25, z: 11.5, yawDeg: 90, color: 0xdccb9e, name: 'the cream Lincoln' },       // 1st Ave N, near Jefferson Trust
  { x: -12.5, z: 70, yawDeg: 180, color: 0x4a1420, name: 'the oxblood Packard' },   // 20th St N, south of the Corner
  { x: 65, z: -11.5, yawDeg: -90, color: 0x141414, name: 'a black Ford' },          // 1st Ave N, near Empire Building
  { x: -140, z: 11.5, yawDeg: 90, color: 0x101010, name: 'a black Dodge' },         // 1st Ave N, near TCI Building
  { x: -330, z: -150.5, yawDeg: 90, color: 0x151515, name: 'a black Buick' },       // 2nd Ave N, near Hotel Tutwiler
  { x: -420, z: -269.5, yawDeg: -90, color: 0x0e0e0e, name: 'a black Chevrolet' },  // 3rd Ave N, near Terminal Station
];

/**
 * buildSedan — one 1920s box-art sedan: long hood, tall cabin, running
 * boards, spoked-suggestion wheels (dark cylinders), a deep-lacquer body,
 * and a pair of headlight spotlights wired to night.
 * @param {typeof import('three')} THREE
 * @param {object} materials shared material palette (engine/materials.js)
 * @param {number} bodyColor hex color of the lacquer body
 */
function buildSedan(THREE, materials, bodyColor) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.22, metalness: 0.55 });
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.58, 2.05), bodyMat);
  hood.position.set(0, 0.63, 1.15);
  group.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.88, 2.3), bodyMat);
  cabin.position.set(0, 0.86, -0.55);
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 1.7), bodyMat);
  roof.position.set(0, 1.34, -0.55);
  group.add(roof);

  const boardMat = materials.steelDark;
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 3.5), boardMat);
    board.position.set(side * 0.95, 0.4, -0.1);
    group.add(board);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const zPos of [1.5, -1.5]) {
      const wheel = new THREE.Mesh(wheelGeo, materials.steelDark);
      wheel.position.set(side * 0.95, 0.36, zPos);
      group.add(wheel);
    }
  }

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d0, emissive: 0xffdca0, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.1,
  });
  const lampGeo = new THREE.SphereGeometry(0.14, 8, 8);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(lampGeo, headlightMat);
    lamp.position.set(side * 0.55, 0.62, 2.14);
    group.add(lamp);
  }

  const spotLights = [];
  for (const side of [-1, 1]) {
    const light = new THREE.SpotLight(0xffdca0, 0, 28, Math.PI / 7.5, 0.45, 1.4);
    light.position.set(side * 0.55, 0.62, 1.2);
    const target = new THREE.Object3D();
    target.position.set(side * 0.55, 0.2, 8);
    group.add(target);
    light.target = target;
    group.add(light);
    spotLights.push(light);
  }

  return { group, bodyMat, headlightMat, spotLights };
}

/**
 * @param {object} ctx engine + district context per TECH-CONTRACT, plus
 *   `controls` (added to ctx in main.js) and `streetcars` (merged in by
 *   systems/index.js from its own startStreetcars() result).
 */
export function startDriving(ctx) {
  const { THREE, scene, materials, getDayPhase, camera, plan, streetcars } = ctx;
  const controls = ctx.controls || { setEnabled() {}, getColliderBoxes() { return EMPTY_BOXES; } };
  const bounds = plan.bounds;

  // --- Build parked sedans ------------------------------------------------
  const cars = SEDAN_SPECS.map((spec) => {
    const built = buildSedan(THREE, materials, spec.color);
    built.group.position.set(spec.x, 0, spec.z);
    const heading = THREE.MathUtils.degToRad(spec.yawDeg);
    built.group.rotation.y = heading;
    scene.add(built.group);
    return {
      ...built,
      name: spec.name,
      x: spec.x, z: spec.z, heading,
      speed: 0, vx: 0, vz: 0,
    };
  });

  // --- Boarding prompt (self-contained; no narrative module exists yet) --
  let promptEl = null;
  function ensurePrompt() {
    if (promptEl) return promptEl;
    const el = document.createElement('div');
    el.id = 'mc-driving-prompt';
    el.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:16%', 'transform:translateX(-50%)',
      "font-family:Georgia,'Times New Roman',serif", 'font-size:16px', 'letter-spacing:0.08em',
      'color:#e8d9b0', 'background:rgba(12,10,18,0.7)', 'border:1px solid rgba(185,141,62,0.55)',
      'padding:8px 20px', 'border-radius:2px', 'pointer-events:none', 'z-index:6', 'display:none',
      'text-shadow:0 0 10px rgba(0,0,0,0.6)',
    ].join(';');
    document.body.appendChild(el);
    promptEl = el;
    return el;
  }
  function showPrompt(text) {
    const el = ensurePrompt();
    if (el.textContent !== text) el.textContent = text;
    el.style.display = 'block';
  }
  function hidePrompt() {
    if (promptEl) promptEl.style.display = 'none';
  }

  // --- State ----------------------------------------------------------
  let isDriving = false;
  let activeCar = null;
  let isRiding = false;
  let ridingCar = null;
  let pendingCar = null;
  let pendingTram = null;

  // --- Drive input (own listeners; independent of controls.js's own) -----
  const driveKeys = Object.create(null);
  function onKeyDown(e) {
    if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD'
        || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      driveKeys[e.code] = true;
    }
    if (e.repeat) return;
    if (e.code === 'KeyE') {
      if (isDriving) exitCar();
      else if (isRiding) exitTram();
      else if (pendingCar) enterCar(pendingCar);
      else if (pendingTram) enterTram(pendingTram);
    } else if (e.code === 'KeyH') {
      if (isDriving) playHorn();
    }
  }
  function onKeyUp(e) {
    driveKeys[e.code] = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // --- Enter/exit car ---------------------------------------------------
  function enterCar(car) {
    activeCar = car;
    car.speed = 0; car.vx = 0; car.vz = 0;
    controls.setEnabled(false);
    isDriving = true;
    hidePrompt();
  }
  function exitCar() {
    const car = activeCar;
    const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
    camera.position.set(car.x + sideX * EXIT_OFFSET, EYE_HEIGHT, car.z + sideZ * EXIT_OFFSET);
    camera.rotation.set(0, car.heading, 0);
    car.speed = 0; car.vx = 0; car.vz = 0;
    controls.setEnabled(true);
    isDriving = false;
    activeCar = null;
  }

  // --- Board/step-off streetcar ------------------------------------------
  function enterTram(tram) {
    ridingCar = tram;
    isRiding = true;
    controls.setEnabled(false);
    hidePrompt();
  }
  function exitTram() {
    const g = ridingCar.group;
    const heading = g.rotation.y;
    const sideX = Math.cos(heading) * EXIT_TRAM_OFFSET, sideZ = -Math.sin(heading) * EXIT_TRAM_OFFSET;
    camera.position.set(g.position.x + sideX, EYE_HEIGHT, g.position.z + sideZ);
    camera.rotation.set(0, heading, 0);
    controls.setEnabled(true);
    isRiding = false;
    ridingCar = null;
  }

  // --- WebAudio: horn + engine putter -------------------------------------
  const rng = makeRng(1929);
  let engine = null;
  function initAudio() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;
    const bus = ac.createGain();
    bus.gain.value = 0.0;
    bus.connect(master);

    const square = ac.createOscillator();
    square.type = 'square';
    square.frequency.value = 42;
    const squareGain = ac.createGain();
    squareGain.gain.value = 0.55;
    square.connect(squareGain);
    squareGain.connect(bus);
    square.start();

    const noiseSrc = ac.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(ac, 1, rng);
    noiseSrc.loop = true;
    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 200;
    const noiseGain = ac.createGain();
    noiseGain.gain.value = 0.4;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(bus);
    noiseSrc.start();

    engine = { ac, bus, square, noiseFilter };
  }
  onReady(initAudio);

  function hornTone(ac, dest, t, freq, dur) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.82), t + dur);
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq * 1.4;
    filt.Q.value = 3.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filt); filt.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function playHorn() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;
    const t = ac.currentTime;
    hornTone(ac, master, t, 400, 0.32);
    hornTone(ac, master, t + 0.26, 270, 0.58);
  }

  // --- Physics --------------------------------------------------------
  function updateDrivingPhysics(dt) {
    const car = activeCar;
    let throttle = 0;
    if (driveKeys.KeyW || driveKeys.ArrowUp) throttle = 1;
    else if (driveKeys.KeyS || driveKeys.ArrowDown) throttle = -1;

    if (throttle > 0) {
      car.speed += ACCEL * dt;
    } else if (throttle < 0) {
      car.speed += (car.speed > 0.05 ? -BRAKE_DECEL : -REVERSE_ACCEL) * dt;
    } else if (car.speed > 0) {
      car.speed = Math.max(0, car.speed - FRICTION_DECEL * dt);
    } else if (car.speed < 0) {
      car.speed = Math.min(0, car.speed + FRICTION_DECEL * dt);
    }
    car.speed = clamp(car.speed, MAX_REVERSE, MAX_SPEED);

    let steer = 0;
    if (driveKeys.KeyA || driveKeys.ArrowLeft) steer = -1;
    if (driveKeys.KeyD || driveKeys.ArrowRight) steer += 1;
    if (Math.abs(car.speed) > 0.15) {
      const speedFrac = Math.min(1, Math.abs(car.speed) / MAX_SPEED);
      const turnRate = MAX_STEER_RATE - (MAX_STEER_RATE - MIN_STEER_RATE) * speedFrac;
      const dirSign = car.speed >= 0 ? 1 : -1;
      car.heading += steer * turnRate * dt * dirSign;
    }

    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const lag = Math.min(1, DRIFT_LAG * dt);
    car.vx += (fx * car.speed - car.vx) * lag;
    car.vz += (fz * car.speed - car.vz) * lag;

    const boxes = controls.getColliderBoxes ? controls.getColliderBoxes() : EMPTY_BOXES;
    const nx = car.x + car.vx * dt;
    const nz = car.z + car.vz * dt;
    if (!boxHit(boxes, nx, car.z, CAR_RADIUS)) {
      car.x = clamp(nx, bounds.minX, bounds.maxX);
    } else {
      car.vx = 0; car.speed *= 0.25;
    }
    if (!boxHit(boxes, car.x, nz, CAR_RADIUS)) {
      car.z = clamp(nz, bounds.minZ, bounds.maxZ);
    } else {
      car.vz = 0; car.speed *= 0.25;
    }

    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
  }

  function positionChaseCamera() {
    const car = activeCar;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    camera.position.set(car.x - fx * CHASE_DIST, CHASE_HEIGHT, car.z - fz * CHASE_DIST);
    camera.lookAt(car.x + fx * 4, 1.3, car.z + fz * 4);
  }

  function updateEngineAudio() {
    if (!engine) return;
    const car = activeCar;
    const speedFrac = car ? Math.min(1, Math.abs(car.speed) / MAX_SPEED) : 0;
    const throttling = isDriving && (driveKeys.KeyW || driveKeys.ArrowUp) ? 1 : 0;
    const targetGain = isDriving ? 0.045 + speedFrac * 0.1 + throttling * 0.05 : 0.0;
    const targetFreq = 38 + speedFrac * 65;
    engine.bus.gain.setTargetAtTime(targetGain, engine.ac.currentTime, 0.15);
    engine.square.frequency.setTargetAtTime(targetFreq, engine.ac.currentTime, 0.2);
    engine.noiseFilter.frequency.setTargetAtTime(160 + speedFrac * 260, engine.ac.currentTime, 0.2);
  }

  function updateRidingCamera() {
    const g = ridingCar.group;
    const heading = g.rotation.y;
    const sideX = Math.cos(heading) * RIDE_SIDE, sideZ = -Math.sin(heading) * RIDE_SIDE;
    camera.position.set(g.position.x + sideX, g.position.y + RIDE_HEIGHT, g.position.z + sideZ);
    camera.rotation.set(0, heading, 0);
  }

  function updateProximityPrompt() {
    let nearestCar = null, nearestCarDist = Infinity;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const d = Math.hypot(camera.position.x - c.x, camera.position.z - c.z);
      if (d < nearestCarDist) { nearestCarDist = d; nearestCar = c; }
    }
    let nearestTram = null, nearestTramDist = Infinity;
    const liveCars = streetcars && streetcars.getCars ? streetcars.getCars() : null;
    if (liveCars) {
      for (let i = 0; i < liveCars.length; i++) {
        const t = liveCars[i];
        const d = Math.hypot(camera.position.x - t.group.position.x, camera.position.z - t.group.position.z);
        if (d < nearestTramDist) { nearestTramDist = d; nearestTram = t; }
      }
    }

    if (nearestCarDist <= CAR_PROMPT_RADIUS && nearestCarDist <= nearestTramDist) {
      pendingCar = nearestCar; pendingTram = null;
      showPrompt('Press E to drive');
    } else if (nearestTramDist <= TRAM_PROMPT_RADIUS) {
      pendingCar = null; pendingTram = nearestTram;
      showPrompt('Press E to board');
    } else {
      pendingCar = null; pendingTram = null;
      hidePrompt();
    }
  }

  return {
    update(dt) {
      const night = isNight(getDayPhase());
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        const on = night ? 1 : 0;
        c.spotLights[0].intensity = on * 1.5;
        c.spotLights[1].intensity = on * 1.5;
        c.headlightMat.emissiveIntensity = 0.35 + on * 2.1;
      }

      updateEngineAudio();

      if (isDriving) {
        updateDrivingPhysics(dt);
        positionChaseCamera();
        showPrompt('Press E to park');
      } else if (isRiding) {
        updateRidingCamera();
        showPrompt('Press E to step off');
      } else {
        updateProximityPrompt();
      }
    },
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    },
  };
}
