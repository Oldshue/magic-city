/**
 * driving.js — makes Magic City 1929 drivable: 4-6 parked period sedans at
 * plausible downtown/terminal-quarter curbs, walk-up "Press E to drive"
 * boarding, arcade car physics (throttle/brake/steer/gentle drift, ~80 km/h
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
import { readVehicleInput } from '../engine/vehicle-input.mjs';
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../engine/controls.js';
import { buildPeriodSedan, updateSedanWheels } from '../engine/period-sedan.js';
import { carFootprintBlocked, clearCameraFraction, carWorldPoint, driverApproach, DRIVER_MARK, HALF_WIDTH, hitsMovingObstacle, setCarBounds } from '../engine/vehicle-motion.mjs';
import { createDriverPerformer } from '../engine/driver-performer.js';
import { ROAD_HEIGHT } from '../engine/street-layout.js';

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
const CHASE_DIST = 5.7;
const CHASE_HEIGHT = 2.48;
const EXIT_OFFSET = 1.8;
const DRIVER_EXIT_X = HALF_WIDTH + PLAYER_RADIUS + .105;
const APPROACH_SPEED = 2.0;
const BOARD_SECONDS = 1.62;

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
  { x: 25, z: 11.5, yawDeg: 90, color: 0xdccb9e, name: 'the cream Lincoln', whitewall: true },       // 1st Ave N, near Jefferson Trust
  { x: -9.3, z: 42, yawDeg: 180, color: 0x4a1420, name: 'the oxblood Packard', whitewall: true },   // 20th St N, south of the Corner
  { x: 65, z: -11.5, yawDeg: -90, color: 0x141414, name: 'a black Ford' },          // 1st Ave N, near Empire Building
  { x: -140, z: 11.5, yawDeg: 90, color: 0x101010, name: 'a black Dodge' },         // 1st Ave N, near TCI Building
  { x: -330, z: -150.5, yawDeg: 90, color: 0x151515, name: 'a black Buick' },       // 2nd Ave N, near Hotel Tutwiler
  { x: -420, z: -269.5, yawDeg: -90, color: 0x0e0e0e, name: 'a black Chevrolet' },  // 3rd Ave N, near Terminal Station
];

/**
 * @param {object} ctx engine + district context per TECH-CONTRACT, plus
 *   `controls` (added to ctx in main.js) and `streetcars` (merged in by
 *   systems/index.js from its own startStreetcars() result).
 */
export function startDriving(ctx) {
  const { THREE, scene, getDayPhase, camera, plan, streetcars, environment, streetReflection } = ctx;
  const controls = ctx.controls || { setEnabled() {}, getColliderBoxes() { return EMPTY_BOXES; } };
  const bounds = plan.bounds;
  const player = createDriverPerformer(scene);

  // --- Build parked sedans ------------------------------------------------
  const cars = SEDAN_SPECS.map((spec) => {
    const built = buildPeriodSedan(spec.color, environment, {whitewall:spec.whitewall});
    if (streetReflection) {
      streetReflection.exclude(built.group);
      for (const material of built.reflective) streetReflection.reflect(material);
    }
    built.group.name = spec.name;
    built.group.position.set(spec.x, ROAD_HEIGHT, spec.z);
    const heading = THREE.MathUtils.degToRad(spec.yawDeg);
    built.group.rotation.y = heading;
    scene.add(built.group);
    return {
      ...built,
      name: spec.name,
      x: spec.x, z: spec.z, heading, collider:{},
      speed: 0, vx: 0, vz: 0, wheelAngle: 0, steeringAngle: 0, braking: false,
    };
  });

  const parkedVehicles = cars.map(car=>setCarBounds(car.collider,car.x,car.z,car.heading,car));
  const removeParkedVehicles = controls.addMovingColliders?.(parkedVehicles);

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
    if (ctx.interactions) return;
    const el = ensurePrompt();
    if (el.textContent !== text) el.textContent = text;
    el.style.display = 'block';
  }
  function hidePrompt() {
    if (promptEl) promptEl.style.display = 'none';
  }

  // A period dashboard readout makes the witnessed speed rule legible.
  let speedometer = null, speedValue = null, lastSpeedShown = NaN;
  function showSpeedometer(car) {
    if (!speedometer) {
      speedometer = document.createElement('aside'); speedometer.id = 'mc-speedometer';
      speedometer.setAttribute('aria-label', 'Vehicle speed and controls');
      speedometer.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);z-index:7;padding:10px 18px;border:1px solid #8d754d;background:#121a18e8;color:#ebdfbf;font-family:Georgia,serif;text-align:center;pointer-events:none;display:none";
      speedometer.innerHTML = '<strong id="mc-driving-speed"></strong><small style="display:block;font-size:10px;letter-spacing:1px;margin-top:5px">E · PARK / H · HORN</small>';
      const dashboardStyle = document.createElement('style');
      dashboardStyle.textContent = '#mc-speedometer{bottom:24px}@media(max-width:600px){#mc-speedometer{bottom:130px}}';
      document.head.appendChild(dashboardStyle);
      document.body.appendChild(speedometer); speedValue = speedometer.querySelector('strong');
    }
    speedometer.style.display = 'block';
    const mph = Math.round(car.speed * 2.23694);
    if (mph !== lastSpeedShown) { lastSpeedShown = mph; speedValue.textContent = (mph < 0 ? 'REVERSE · ' : '') + Math.abs(mph) + ' MPH'; }
  }
  function hideSpeedometer() { if (speedometer) speedometer.style.display = 'none'; }

  // --- State ----------------------------------------------------------
  let isDriving = false;
  let activeCar = null;
  let access = null;
  let exitRequested = false;
  let blockedDoorSeconds = 0;
  let isRiding = false;
  let ridingCar = null;
  let pendingCar = null;
  let pendingTram = null;
  let impactSequence = 0, impactCooldown = 0;

  // --- Drive input (own listeners; independent of controls.js's own) -----
  const driveKeys = Object.create(null);
  const vehicleInput = { throttle: 0, steer: 0 };
  const chaseTarget = new THREE.Vector3();
  const chasePosition = new THREE.Vector3();
  const accessView = new THREE.Vector3(), accessTarget = new THREE.Vector3();
  const exitView = new THREE.Vector3(), exitTarget = new THREE.Vector3();
  let chaseReady = false;
  function onKeyDown(e) {
    if (controls.isInputBlocked?.()) return;
    if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD'
        || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      driveKeys[e.code] = true;
    }
    if (e.repeat) return;
    if (e.code === 'KeyH') {
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
    const obstacles = controls.getColliderBoxes().concat(controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES);
    const path = driverApproach(obstacles,car.x,car.z,car.heading,camera.position.x,camera.position.z);
    if (!path) {
      blockedDoorSeconds = 1.6;
      return;
    }
    activeCar = car;
    car.speed = 0; car.vx = 0; car.vz = 0;
    controls.setEnabled(false);
    chaseReady = false;
    startVehicleAccess(true,path);
    hidePrompt();
  }

  function startVehicleAccess(entering,path = []) {
    access = {
      entering,path,index:0,time:0,cameraTime:0,
      x:camera.position.x,z:camera.position.z,
      from:camera.position.clone(),orientation:camera.quaternion.clone(),
    };
    if (!entering) {
      const car = activeCar;
      const [x,z] = carWorldPoint(car.x,car.z,car.heading,DRIVER_EXIT_X,DRIVER_MARK.z);
      access.x = x; access.z = z;
    }
  }

  function safeExitPoint(car) {
    const boxes = controls.getColliderBoxes();
    const vehicles = controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES;
    for (const [lx,lz] of [[DRIVER_EXIT_X,DRIVER_MARK.z],[EXIT_OFFSET,0],[-EXIT_OFFSET,0],[0,-2.75],[0,2.75]]) {
      const [x,z] = carWorldPoint(car.x,car.z,car.heading,lx,lz);
      if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
          && !boxHit(boxes,x,z,PLAYER_RADIUS)
          && !vehicles.some(box=>hitsMovingObstacle(box,x,z,PLAYER_RADIUS))) return [x,z];
    }
    return null;
  }

  function finishExit(x,z) {
    const car = activeCar;
    car.driverDoor.rotation.y = 0;
    player.hide();
    camera.position.set(x,EYE_HEIGHT,z);
    camera.rotation.set(0,car.heading + Math.PI,0,'YXZ');
    car.speed = 0; car.vx = 0; car.vz = 0; car.braking = false;
    controls.setEnabled(true);
    isDriving = false;
    activeCar = null;
    access = null;
    exitRequested = false;
    hideSpeedometer();
  }

  function leaveWhenStopped() {
    if (Math.abs(activeCar.speed) + Math.hypot(activeCar.vx,activeCar.vz) > .40) return;
    const car = activeCar;
    const exit = safeExitPoint(car);
    if (!exit) {
      exitRequested = false;
      blockedDoorSeconds = 1.6;
      return;
    }
    const [x,z] = exit;
    const [driverX,driverZ] = carWorldPoint(car.x,car.z,car.heading,DRIVER_EXIT_X,DRIVER_MARK.z);
    if (Math.hypot(x-driverX,z-driverZ) > .08) {
      finishExit(x,z);
      return;
    }
    car.speed = 0; car.vx = 0; car.vz = 0;
    hideSpeedometer();
    startVehicleAccess(false);
    exitRequested = false;
  }

  function exitCar() {
    if (access || !isDriving) return;
    exitRequested = true;
    leaveWhenStopped();
  }

  function advanceApproach(dt) {
    const plan = access;
    let remaining = dt * APPROACH_SPEED;
    const fromX = plan.x, fromZ = plan.z;
    while (remaining > 0 && plan.index < plan.path.length) {
      const [x,z] = plan.path[plan.index];
      const dx = x-plan.x, dz = z-plan.z;
      const distance = Math.hypot(dx,dz);
      if (distance <= remaining) {
        plan.x = x; plan.z = z; plan.index++;
        remaining -= distance;
      } else {
        plan.x += dx*remaining/distance;
        plan.z += dz*remaining/distance;
        remaining = 0;
      }
    }
    if (plan.index === plan.path.length) return false;
    player.approach(plan.x,plan.z,Math.atan2(plan.x-fromX,plan.z-fromZ),APPROACH_SPEED,dt);
    return true;
  }

  function positionAccessCamera(car,t) {
    const shotSide = 3.62, shotRear = -3.05;
    const [x,z] = carWorldPoint(car.x,car.z,car.heading,shotSide,shotRear);
    const [tx,tz] = carWorldPoint(car.x,car.z,car.heading,.7,-.31);
    accessView.set(x,2.13,z);
    accessTarget.set(tx,1.06,tz);
    if (access.entering) {
      const chase = THREE.MathUtils.smoothstep(t,.66,1);
      setChaseView(car);
      accessView.lerp(chasePosition,chase);
      accessTarget.lerp(chaseTarget,chase);
    } else {
      const firstPerson = THREE.MathUtils.smoothstep(t,.57,1);
      exitView.set(access.x,EYE_HEIGHT,access.z);
      exitTarget.set(access.x + Math.sin(car.heading)*3,EYE_HEIGHT,access.z + Math.cos(car.heading)*3);
      accessView.lerp(exitView,firstPerson);
      accessTarget.lerp(exitTarget,firstPerson);
    }
    const clear = clearCameraFraction(controls.getColliderBoxes(),car.x,car.z,accessView.x,accessView.z);
    accessView.x = THREE.MathUtils.lerp(car.x,accessView.x,clear);
    accessView.z = THREE.MathUtils.lerp(car.z,accessView.z,clear);
    const reveal = THREE.MathUtils.smoothstep(access.cameraTime,0,.44);
    camera.position.copy(access.from).lerp(accessView,reveal);
    camera.lookAt(accessTarget);
    camera.quaternion.slerp(access.orientation,1-reveal);
  }

  function updateVehicleAccess(dt) {
    const car = activeCar;
    access.cameraTime += dt;
    if (access.entering && advanceApproach(dt)) {
      positionAccessCamera(car,0);
      return;
    }
    access.time += dt;
    const t = Math.min(1,access.time/BOARD_SECONDS);
    const phase = access.entering ? t : 1-t;
    const open = THREE.MathUtils.smoothstep(phase,.10,.33) * (1-THREE.MathUtils.smoothstep(phase,.64,.96));
    if (car.driverDoor.rotation.y < -.085 && open < .079) playDoorLatch();
    car.driverDoor.rotation.y = -1.07 * open;
    player.board(car,phase);
    positionAccessCamera(car,t);
    if (t < 1) return;
    if (access.entering) {
      isDriving = true;
      access = null;
      player.drive(car);
    } else {
      finishExit(access.x,access.z);
    }
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

    engine = { ac, bus, square, noiseFilter, doorNoise:makeNoiseBuffer(ac,.18,rng) };
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
  function playDoorLatch() {
    const audio = getAudio();
    if (!audio || !engine) return;
    const {ac, doorNoise} = engine;
    const source = ac.createBufferSource();
    source.buffer = doorNoise;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 860;
    const volume = ac.createGain();
    const now = ac.currentTime;
    volume.gain.setValueAtTime(.22,now);
    volume.gain.exponentialRampToValueAtTime(.001,now + .17);
    source.connect(filter).connect(volume).connect(audio.master);
    source.start();
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
    const input = readVehicleInput(driveKeys, controls.getVirtualMove?.(), vehicleInput);
    const throttle = exitRequested ? 0 : input.throttle;
    const steer = exitRequested ? 0 : input.steer;

    const startX = car.x, startZ = car.z;
    const boxes = controls.getColliderBoxes();
    const vehicles = controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES;
    car.braking = exitRequested || (throttle < -0.05 && car.speed > 0.35);
    if (exitRequested) {
      car.speed = Math.sign(car.speed) * Math.max(0,Math.abs(car.speed)-BRAKE_DECEL*dt);
    } else if (throttle > 0) {
      car.speed += ACCEL * throttle * dt;
    } else if (throttle < 0) {
      car.speed += (car.speed > 0.05 ? -BRAKE_DECEL : -REVERSE_ACCEL) * Math.abs(throttle) * dt;
    } else if (car.speed > 0) {
      car.speed = Math.max(0, car.speed - FRICTION_DECEL * dt);
    } else if (car.speed < 0) {
      car.speed = Math.min(0, car.speed + FRICTION_DECEL * dt);
    }
    car.speed = clamp(car.speed, MAX_REVERSE, MAX_SPEED);

    if (Math.abs(car.speed) > 0.15) {
      const speedFrac = Math.min(1, Math.abs(car.speed) / MAX_SPEED);
      const turnRate = MAX_STEER_RATE - (MAX_STEER_RATE - MIN_STEER_RATE) * speedFrac;
      const dirSign = car.speed >= 0 ? 1 : -1;
      const heading = car.heading + steer * turnRate * dt * dirSign;
      if (!carFootprintBlocked(boxes,car.x,car.z,heading) && !carFootprintBlocked(vehicles,car.x,car.z,heading)) car.heading = heading;
    }

    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const lag = Math.min(1, DRIFT_LAG * dt);
    car.vx += (fx * car.speed - car.vx) * lag;
    car.vz += (fz * car.speed - car.vz) * lag;

    const impactSpeed = Math.abs(car.speed);
    let collided = false;
    const nx = car.x + car.vx * dt;
    const nz = car.z + car.vz * dt;
    if (!carFootprintBlocked(boxes,nx,car.z,car.heading) && !carFootprintBlocked(vehicles,nx,car.z,car.heading)) {
      car.x = clamp(nx, bounds.minX, bounds.maxX);
    } else {
      collided = true; car.vx = 0; car.speed *= 0.25;
    }
    if (!carFootprintBlocked(boxes,car.x,nz,car.heading) && !carFootprintBlocked(vehicles,car.x,nz,car.heading)) {
      car.z = clamp(nz, bounds.minZ, bounds.maxZ);
    } else {
      collided = true; car.vz = 0; car.speed *= 0.25;
    }

    if (collided && impactSpeed >= 6 && impactCooldown <= 0) { impactSequence++; impactCooldown = 1; }
    car.group.position.set(car.x, ROAD_HEIGHT, car.z);
    car.group.rotation.y = car.heading;
    setCarBounds(car.collider,car.x,car.z,car.heading,car);
    const travelled = (car.x - startX) * fx + (car.z - startZ) * fz;
    updateSedanWheels(car, travelled, steer, dt);
  }

  function setChaseView(car) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const distance = CHASE_DIST + Math.min(1.1, Math.abs(car.speed) * 0.05);
    chasePosition.set(car.x - fx * distance, CHASE_HEIGHT, car.z - fz * distance);
    chaseTarget.set(car.x + fx * 2.4, 1.12, car.z + fz * 2.4);
  }

  function positionChaseCamera(dt) {
    const car = activeCar;
    setChaseView(car);
    if (!chaseReady) camera.position.copy(chasePosition);
    else camera.position.lerp(chasePosition, 1 - Math.exp(-dt * 9));
    chaseReady = true;
    const clearance = clearCameraFraction(controls.getColliderBoxes(), car.x, car.z, camera.position.x, camera.position.z);
    camera.position.x = THREE.MathUtils.lerp(car.x, camera.position.x, clearance);
    camera.position.z = THREE.MathUtils.lerp(car.z, camera.position.z, clearance);
    camera.position.y = Math.max(CHASE_HEIGHT - 0.15, camera.position.y);
    camera.lookAt(chaseTarget);
  }

  function updateEngineAudio() {
    if (!engine) return;
    const car = activeCar;
    const speedFrac = car ? Math.min(1, Math.abs(car.speed) / MAX_SPEED) : 0;
    const throttling = isDriving && !access && !exitRequested ? Math.max(0, readVehicleInput(driveKeys, controls.getVirtualMove?.(), vehicleInput).throttle) : 0;
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

  const parkCandidate = { distance: 0, priority: 100, label: 'PARK · LEAVE CAR', activate: exitCar };
  const accessCandidate = { distance:0, priority:100, label:'' };
  const disembarkCandidate = { distance: 0, priority: 100, label: 'STEP OFF STREETCAR', activate: exitTram };
  const boardingCandidates = new WeakMap();
  const unregisterInteraction = ctx.interactions.register(() => {
    if (blockedDoorSeconds > 0 || access || exitRequested) {
      accessCandidate.label = blockedDoorSeconds > 0 ? 'DOOR BLOCKED' : access?.entering ? 'GETTING IN' : 'PARKING';
      return accessCandidate;
    }
    if (isDriving) return parkCandidate;
    if (isRiding) return disembarkCandidate;
    updateProximityPrompt();
    const target = pendingCar || pendingTram;
    if (!target) return null;
    let candidate = boardingCandidates.get(target);
    if (!candidate) {
      const car = pendingCar;
      candidate = { distance: 0, label: car ? 'DRIVE · '+car.name : 'BOARD STREETCAR', activate: () => car ? enterCar(car) : enterTram(target) };
      boardingCandidates.set(target, candidate);
    }
    candidate.distance = Math.hypot(camera.position.x-target.group.position.x,camera.position.z-target.group.position.z);
    return candidate;
  });

  return {
    update(dt) {
      if (ctx.controls.isInputBlocked()) {
        hideSpeedometer();
        for (const key in driveKeys) driveKeys[key] = false;
        if (engine) engine.bus.gain.setTargetAtTime(0, engine.ac.currentTime, 0.1);
        return;
      }
      impactCooldown = Math.max(0, impactCooldown - dt);
      blockedDoorSeconds = Math.max(0,blockedDoorSeconds-dt);
      const night = isNight(getDayPhase());
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        const on = night && c === activeCar;
        for (const light of c.spotLights) {
          light.visible = on;
          light.intensity = on ? 390 : 0;
        }
        c.headlightMat.emissiveIntensity = on ? 2.0 : 0.18;
        c.stopLightMat.emissiveIntensity = c.braking ? 3.2 : on ? 0.75 : 0;
        for (const material of c.reflective) material.envMapIntensity = night ? 0.22 : 0.75;
      }

      updateEngineAudio();

      if (access) {
        updateVehicleAccess(dt);
      } else if (isDriving) {
        updateDrivingPhysics(dt);
        positionChaseCamera(dt);
        player.drive(activeCar);
        showSpeedometer(activeCar);
        showPrompt('Press E to park');
        if (exitRequested) leaveWhenStopped();
      } else if (isRiding) {
        updateRidingCamera();
        showPrompt('Press E to step off');
      } else {
        updateProximityPrompt();
      }
    },
    getState(out = {}) {
      out.driving = isDriving; out.riding = isRiding;
      out.x = activeCar ? activeCar.x : camera.position.x;
      out.z = activeCar ? activeCar.z : camera.position.z;
      out.speed = activeCar ? activeCar.speed : 0;
      out.heading = activeCar?.heading ?? 0;
      out.y = activeCar ? 0 : camera.position.y;
      out.mounted = !!activeCar;
      out.impactSequence = impactSequence;
      return out;
    },
    park() {
      if (activeCar) finishExit(...(safeExitPoint(activeCar) ?? [activeCar.x,activeCar.z]));
      else if (isRiding) exitTram();
    },
    dispose() {
      removeParkedVehicles?.();
      unregisterInteraction();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    },
  };
}
