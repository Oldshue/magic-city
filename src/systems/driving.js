/** Own the controls and camera while the detective enters, drives or leaves a vehicle. */
import { readVehicleInput } from '../engine/vehicle-input.mjs';
import { getAudio, onReady, makeNoiseBuffer, makeRng } from './audioBus.js';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../engine/controls.js';
import { applySedanRide, buildPeriodSedan, updateSedanWheels } from '../engine/period-sedan.js';
import {
  carFootprintBlocked, clearCameraFraction, carWorldPoint, driverApproach, FORD_TUDOR,
  hitsMovingObstacle, LARGE_SEDAN, setCarBounds, sedanYawRate, stepSedanControls, stepSedanRide,
} from '../engine/vehicle-motion.mjs';
import {
  crossingBodyBlocked, pedestrianBrakeRoom, pedestrianTravelFraction, speedAtPedestrian,
} from '../engine/pedestrian-clearance.mjs';
import { createDriverPerformer } from '../engine/driver-performer.js';
import { DOOR_OPEN_ANGLE, doorAngle, ENTRY, exitMotion } from '../engine/vehicle-access.js';
import { createStreetContact, ROAD_HEIGHT, SIDEWALK_HEIGHT } from '../engine/street-layout.js';

const PHYSICS_STEP = 0.025;
const CURB_MID_HEIGHT = (SIDEWALK_HEIGHT - ROAD_HEIGHT) * 0.5;
const CHASE_DIST = 5.7;
const CHASE_HEIGHT = 2.48;
const CABIN_NEAR = .31;
const EXIT_OFFSET = 1.8;
const APPROACH_SPEED = 2.0;
const ANIMATION_FPS = 30;
const VEHICLE_SOUNDS = {
  brake: [695, 0.14, 0.175],
  release: [1520, 0.10, 0.15],
  latch: [860, 0.22, 0.17],
  board: [410, 0.13, 0.11],
  street: [280, 0.09, 0.085],
  wiper: [910, 0.047, 0.1],
};

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
  { x: 9.3, z: 40, yawDeg: 180, color: 0x324939, name: 'the green Ford Tudor', configuration: FORD_TUDOR },
  { x: 65, z: -11.5, yawDeg: -90, color: 0x222628, name: 'a black Ford', configuration: FORD_TUDOR },          // 1st Ave N, near Empire Building
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
  const exteriorNear = camera.near;
  const tyreContacts = new Map([
    [LARGE_SEDAN,createStreetContact(scene,LARGE_SEDAN.tyreRadius,.042)],
    [FORD_TUDOR,createStreetContact(scene,FORD_TUDOR.tyreRadius,.034)],
  ]);
  const streetHeight = createStreetContact(scene, 0);
  const player = createDriverPerformer(scene,{wardrobe:ctx.wardrobe});

  // --- Build parked sedans ------------------------------------------------
  const cars = SEDAN_SPECS.map((spec) => {
    const built = buildPeriodSedan(spec.color,environment,{whitewall:spec.whitewall, configuration:spec.configuration});
    if (streetReflection) {
      streetReflection.exclude(built.group);
      for (const material of built.reflective) streetReflection.reflect(material);
    }
    built.group.name = spec.name;
    built.group.position.set(spec.x, ROAD_HEIGHT, spec.z);
    const heading = THREE.MathUtils.degToRad(spec.yawDeg);
    built.group.rotation.y = heading;
    scene.add(built.group);
    const car = {
      ...built,
      name: spec.name, tyreContact: tyreContacts.get(built.configuration),
      x: spec.x, z: spec.z, heading, collider:{},
      speed: 0, vx: 0, vz: 0, braking: false, curbCooldown: 0, wipersOn: false,
    };
    updateWheelContact(car, 0);
    updateRide(car, 0, 0, 0);
    return car;
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
  let speedometer = null, speedValue = null, yieldLine = null, viewButton = null, wiperButton = null, lastSpeedShown = NaN;
  function showSpeedometer(car) {
    if (!speedometer) {
      speedometer = document.createElement('aside'); speedometer.id = 'mc-speedometer';
      speedometer.setAttribute('aria-label', 'Vehicle speed and controls');
      speedometer.style.cssText = "position:fixed;z-index:7;border:1px solid #8d754d;background:#121a18e8;color:#ebdfbf;font-family:Georgia,serif;text-align:center;pointer-events:none;display:none";
      speedometer.innerHTML = '<strong id="mc-driving-speed"></strong>'
        +'<small id="mc-crossing-yield" role="status" hidden>PEDESTRIAN CROSSING</small>'
        +'<small class="mc-driving-controls">E · PARK / H · HORN</small>'
        +'<div class="mc-driving-buttons"><button type="button" id="mc-driving-view" aria-keyshortcuts="C"></button>'
        +'<button type="button" id="mc-driving-wipers" aria-keyshortcuts="V" aria-pressed="false">Wipers · V</button></div>';
      const dashboardStyle = document.createElement('style');
      dashboardStyle.textContent = '#mc-speedometer{left:50%;bottom:24px;transform:translateX(-50%);padding:10px 18px}'
        +'#mc-crossing-yield:not([hidden]),.mc-driving-controls{display:block;font-size:10px;letter-spacing:1px;margin-top:5px}'
        +'#mc-crossing-yield{color:#ffd68c}'
        +'.mc-driving-buttons{display:flex;justify-content:center;flex-wrap:wrap;gap:5px;margin-top:6px}'
        +'.mc-driving-buttons button{pointer-events:auto;min-height:28px;padding:3px 8px;cursor:pointer;border:1px solid #8d754d;color:inherit;background:#1d2521;font:12px Georgia,serif}'
        +'.mc-driving-buttons button:focus-visible{outline:2px solid #ffd68c;outline-offset:2px}'
        +'#mc-driving-wipers[aria-pressed="true"]{background:#d1b475;color:#171d19;border-color:#efd48b}'
        +'@media(max-width:600px){'
        +'#mc-speedometer{left:14px;bottom:130px;transform:none;max-width:calc(100vw - 210px);box-sizing:border-box;padding:8px 10px}'
        +'.mc-driving-buttons button{min-height:40px;max-width:100%}}';
      document.head.appendChild(dashboardStyle);
      document.body.appendChild(speedometer); speedValue = speedometer.querySelector('strong');
      yieldLine=speedometer.querySelector('#mc-crossing-yield');
      viewButton=speedometer.querySelector('#mc-driving-view');
      viewButton.addEventListener('click',toggleDrivingView);
      wiperButton=speedometer.querySelector('#mc-driving-wipers');
      wiperButton.addEventListener('click',toggleWipers);
    }
    speedometer.style.display = 'block';
    yieldLine.hidden=!car.crossingYield;
    const viewLabel=cabinView ? 'Chase view · C' : 'Cabin view · C';
    if (viewButton.textContent!==viewLabel) viewButton.textContent=viewLabel;
    const wipersPressed=String(car.wipersOn);
    if (wiperButton.getAttribute('aria-pressed')!==wipersPressed) wiperButton.setAttribute('aria-pressed',wipersPressed);
    const mph = Math.round(car.speed * 2.23694);
    if (mph !== lastSpeedShown) { lastSpeedShown = mph; speedValue.textContent = (mph < 0 ? 'REVERSE · ' : '') + Math.abs(mph) + ' MPH'; }
  }
  function hideSpeedometer() { if (speedometer) speedometer.style.display = 'none'; }

  // --- State ----------------------------------------------------------
  let isDriving = false, cabinView = false;
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
  const chaseAim = new THREE.Vector3();
  const cabinAim = new THREE.Vector3();
  const accessView = new THREE.Vector3(), accessTarget = new THREE.Vector3();
  const exitView = new THREE.Vector3(), exitTarget = new THREE.Vector3();
  const doorSweepPoint = new THREE.Vector3();
  let chaseReady = false;
  function toggleDrivingView() {
    if (!isDriving || access || exitRequested || controls.isInputBlocked?.()) return;
    cabinView=!cabinView;
    chaseReady=false;
  }
  function toggleWipers() {
    if (!isDriving || access || exitRequested || controls.isInputBlocked?.()) return;
    activeCar.wipersOn = !activeCar.wipersOn;
  }
  function onKeyDown(e) {
    if (controls.isInputBlocked?.()) return;
    if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD'
        || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      driveKeys[e.code] = true;
    }
    if (e.repeat) return;
    if (e.code === 'KeyH' && isDriving) playHorn();
    if (e.code === 'KeyC') toggleDrivingView();
    if (e.code === 'KeyV') toggleWipers();
  }
  function onKeyUp(e) {
    driveKeys[e.code] = false;
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // --- Enter/exit car ---------------------------------------------------
  function enterCar(car) {
    const boxes = controls.getColliderBoxes();
    const vehicles = controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES;
    const path = driverApproach(boxes.concat(vehicles),car.x,car.z,car.heading,
      camera.position.x,camera.position.z,car.configuration);
    if (!path || !doorCanSwing(car, 1, boxes, vehicles)) {
      blockedDoorSeconds = 1.6;
      return;
    }
    activeCar = car;
    car.speed = 0; car.vx = 0; car.vz = 0; car.crossingYield = false;
    controls.setEnabled(false);
    chaseReady = false;
    startVehicleAccess(ENTRY, path);
    hidePrompt();
  }

  function startVehicleAccess(motion, path = [], landing = null) {
    setCameraNear(exteriorNear);
    const entering = motion === ENTRY;
    access = {
      entering, motion, path, index:0, time:0, cameraTime:0, lastFrame:-motion.slide,
      x: landing ? landing[0] : camera.position.x,
      z: landing ? landing[1] : camera.position.z,
      from: camera.position.clone(), orientation: camera.quaternion.clone(),
    };
  }

  function doorCanSwing(car, side, obstacles, vehicles) {
    const { door, edge } = car.accessDoors[side];
    // Sample the sector swept by the trailing edge of the actual door.
    for (let sweep = 0; sweep <= 8; sweep++) {
      const angle = -side * DOOR_OPEN_ANGLE * sweep / 8;
      const x = edge.position.x * Math.cos(angle) + edge.position.z * Math.sin(angle);
      const z = -edge.position.x * Math.sin(angle) + edge.position.z * Math.cos(angle);
      for (let radius = 1; radius <= 7; radius++) {
        const point = doorSweepPoint.set(door.position.x + x * radius / 7,
          door.position.y + edge.position.y, door.position.z + z * radius / 7);
        car.chassis.localToWorld(point);
        if (boxHit(obstacles, point.x, point.z, 0.12)
            || vehicles.some(box => hitsMovingObstacle(box, point.x, point.z, 0.12))) return false;
      }
    }
    return true;
  }

  function safeExitPoint(car) {
    const boxes = controls.getColliderBoxes();
    const vehicles = controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES;
    const {driverMark,halfWidth,halfLength} = car.configuration;
    const doorX = halfWidth + PLAYER_RADIUS + .105;
    const endZ = halfLength + PLAYER_RADIUS;
    for (const [lx,lz] of [[doorX,driverMark.z],[EXIT_OFFSET,0],[-EXIT_OFFSET,0],[0,-endZ],[0,endZ]]) {
      const [x,z] = carWorldPoint(car.x,car.z,car.heading,lx,lz);
      if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
          && !boxHit(boxes,x,z,PLAYER_RADIUS)
          && !vehicles.some(box=>hitsMovingObstacle(box,x,z,PLAYER_RADIUS))) return [x,z];
    }
    return null;
  }

  function finishExit(x,z) {
    setCameraNear(exteriorNear);
    const car = activeCar;
    car.accessDoors[1].door.rotation.y = 0;
    car.accessDoors[-1].door.rotation.y = 0;
    player.hide();
    camera.position.set(x,EYE_HEIGHT,z);
    camera.rotation.set(0,car.heading + Math.PI,0,'YXZ');
    car.speed = 0; car.vx = 0; car.vz = 0; car.braking = false; car.crossingYield = false; car.wipersOn = false;
    if (car.speedNeedle) car.speedNeedle.rotation.z=Math.PI*.16;
    car.ride.ready = false;
    updateRide(car, 0, 0, 0);
    controls.setEnabled(true);
    isDriving = false;
    activeCar = null;
    access = null;
    exitRequested = false;
    hideSpeedometer();
  }

  function leaveWhenStopped() {
    const car = activeCar;
    if (Math.abs(car.speed) + Math.hypot(car.vx, car.vz) > 0.40) return;
    const boxes = controls.getColliderBoxes();
    const vehicles = controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES;
    for (const side of [1, -1]) {
      const {driverMark,halfWidth} = car.configuration;
      const landing = carWorldPoint(car.x,car.z,car.heading,side*(halfWidth+PLAYER_RADIUS+.105),driverMark.z);
      const [x,z] = landing;
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ
          || boxHit(boxes, x, z, PLAYER_RADIUS)
          || vehicles.some(box => hitsMovingObstacle(box, x, z, PLAYER_RADIUS))
          || !doorCanSwing(car, side, boxes, vehicles)) continue;
      car.speed = 0; car.vx = 0; car.vz = 0;
      hideSpeedometer();
      startVehicleAccess(exitMotion(side), [], landing);
      exitRequested = false;
      return;
    }
    exitRequested = false;
    blockedDoorSeconds = 1.6;
  }

  function exitCar() {
    if (access || !isDriving) return;
    exitRequested = true;
    leaveWhenStopped();
  }

  function advanceApproach(dt) {
    const plan = access;
    if (plan.index === plan.path.length) return false;
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
    const [endX, endZ] = plan.path.at(-1);
    const alignment = 1 - THREE.MathUtils.smoothstep(Math.hypot(endX - plan.x, endZ - plan.z), 0, 0.46);
    const movement = Math.atan2(plan.x - fromX, plan.z - fromZ);
    const difference = activeCar.heading - 75 * Math.PI / 180 - movement;
    const heading = movement + Math.atan2(Math.sin(difference), Math.cos(difference)) * alignment;
    const pace = Math.hypot(plan.x - fromX, plan.z - fromZ) / Math.max(1e-6, dt);
    player.approach(plan.x, plan.z, heading, pace, dt, streetHeight);
    return true;
  }

  function positionAccessCamera(car,t) {
    const shotSide = access.motion.side * 3.72, shotRear = -2.58;
    const [x,z] = carWorldPoint(car.x,car.z,car.heading,shotSide,shotRear);
    const [tx,tz] = carWorldPoint(car.x,car.z,car.heading, access.motion.side * .84, -.31);
    const rideHeight = car.ride.heave.value;
    accessView.set(x, 2.13 + rideHeight, z);
    accessTarget.set(tx, 1.06 + rideHeight, tz);
    if (access.entering) {
      const chase = THREE.MathUtils.smoothstep(t,.66,1);
      setChaseView(car);
      accessView.lerp(chasePosition,chase);
      accessTarget.lerp(chaseTarget,chase);
    } else {
      const firstPerson = THREE.MathUtils.smoothstep(t, 0.74, 1);
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
    updateRide(car, 0, 0, dt);
    access.cameraTime += dt;
    if (access.entering && advanceApproach(dt)) {
      positionAccessCamera(car,0);
      return;
    }
    access.time += dt;
    const motion = access.motion;
    const t = Math.min(1, access.time * ANIMATION_FPS / motion.frames);
    const frame = t * motion.frames - motion.slide;
    const door = car.accessDoors[motion.side].door;
    door.rotation.y = doorAngle(motion, frame);
    const passed = cue => access.lastFrame < cue && frame >= cue;
    if (passed(motion.open[0])) playVehicleSound('release');
    if (passed(motion.latch)) playVehicleSound('latch');
    for (const [cue, kind] of motion.footsteps) {
      if (passed(cue)) playVehicleSound(kind);
    }
    access.lastFrame = frame;
    player.access(car, motion, t, streetHeight);
    positionAccessCamera(car, t);
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
  function playVehicleSound(kind) {
    const [frequency, gain, duration] = VEHICLE_SOUNDS[kind];
    const audio = getAudio();
    if (!audio || !engine) return;
    const {ac, doorNoise} = engine;
    const source = ac.createBufferSource();
    source.buffer = doorNoise;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const volume = ac.createGain();
    const now = ac.currentTime;
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter).connect(volume).connect(audio.master);
    source.start(now, 0, duration);
  }

  function playHorn() {
    const audio = getAudio();
    if (!audio) return;
    const { ctx: ac, master } = audio;
    const t = ac.currentTime;
    hornTone(ac, master, t, 400, 0.32);
    hornTone(ac, master, t + 0.26, 270, 0.58);
  }

  function playCurbThud(speed) {
    if (!engine) return;
    const { ac, bus, doorNoise } = engine;
    const start = ac.currentTime;
    const pulse = ac.createBufferSource();
    pulse.buffer = doorNoise;
    const lowPass = ac.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 118;
    const envelope = ac.createGain();
    envelope.gain.setValueAtTime(Math.min(0.49, 0.21 + speed * 0.023), start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
    pulse.connect(lowPass).connect(envelope).connect(bus);
    pulse.start(start, 0, 0.14);
  }

  function updateWheelContact(car, dt) {
    const sine = Math.sin(car.heading), cosine = Math.cos(car.heading);
    let rise = 0;
    let curb = false;
    for (let i = 0; i < car.wheels.length; i++) {
      const wheel = car.wheels[i];
      const x = car.x + wheel.x * cosine + wheel.z * sine;
      const z = car.z - wheel.x * sine + wheel.z * cosine;
      const yaw = car.heading + wheel.holder.rotation.y;
      const height = car.tyreContact(x,z,yaw) - ROAD_HEIGHT;
      const previous = car.ride.support[i];
      rise += Math.max(0, height - previous);
      curb ||= (height > CURB_MID_HEIGHT) !== (previous > CURB_MID_HEIGHT);
      car.ride.support[i] = height;
    }

    if (!dt) return;
    car.curbCooldown = Math.max(0, car.curbCooldown - dt);
    if (curb && car.curbCooldown === 0 && Math.abs(car.speed) > 0.65) {
      playCurbThud(Math.abs(car.speed));
      car.curbCooldown = 0.12;
    }
    const resistance = Math.exp(-0.78 * rise);
    car.speed *= resistance;
    car.vx *= resistance;
    car.vz *= resistance;
  }

  function updateRide(car, acceleration, lateralAcceleration, dt) {
    stepSedanRide(car.ride, acceleration, lateralAcceleration, dt);
    applySedanRide(car);
  }

  function stepDriving(car, throttle, steer, dt, boxes, vehicles, pedestrians) {
    const startX = car.x, startZ = car.z;
    const startSpeed = car.speed;
    const startHeading = car.heading;
    const config = car.configuration;
    stepSedanControls(car, throttle, steer, exitRequested, dt);
    const direction=Math.sign(car.speed || startSpeed || throttle);
    if (direction) {
      const room=pedestrianBrakeRoom(pedestrians,car.x,car.z,car.heading,direction,startSpeed,config);
      const safeSpeed=speedAtPedestrian(startSpeed,car.speed,room,dt,config);
      if (Math.abs(car.speed-safeSpeed)>1e-6) {
        car.speed=safeSpeed;
        car.braking=true;
        car.crossingYield=true;
      }
    }

    const heading = car.heading + sedanYawRate(car.speed,car.steeringAngle,config.wheelbase) * dt;
    if (!carFootprintBlocked(boxes,car.x,car.z,heading,config)
        && !carFootprintBlocked(vehicles,car.x,car.z,heading,config)
        && !crossingBodyBlocked(pedestrians,car.x,car.z,heading,config)) car.heading = heading;
    const yawTravel = car.heading - startHeading;
    const middle = startHeading + yawTravel / 2;
    const fx = Math.sin(middle), fz = Math.cos(middle);
    // The center of the car moves around the rear axle at parking speeds.
    // A short tire lag softens the response on faster bends.
    const lateral = -config.rearAxleZ * yawTravel / dt;
    const grip = 1 - Math.exp(-15 * dt);
    car.vx += (fx * car.speed + fz * lateral - car.vx) * grip;
    car.vz += (fz * car.speed - fx * lateral - car.vz) * grip;

    const impactSpeed = Math.abs(car.speed);
    let collided = false;
    const travelX=car.vx*dt;
    const clearX=pedestrianTravelFraction(pedestrians,car.x,car.z,car.heading,travelX,0,config);
    const nx=car.x+travelX*clearX;
    if (!carFootprintBlocked(boxes,nx,car.z,car.heading,config) && !carFootprintBlocked(vehicles,nx,car.z,car.heading,config)) {
      car.x = clamp(nx, bounds.minX, bounds.maxX);
    } else {
      collided = true; car.vx = 0; car.speed *= 0.25;
    }
    const travelZ=car.vz*dt;
    const clearZ=pedestrianTravelFraction(pedestrians,car.x,car.z,car.heading,0,travelZ,config);
    const nz=car.z+travelZ*clearZ;
    if (!carFootprintBlocked(boxes,car.x,nz,car.heading,config) && !carFootprintBlocked(vehicles,car.x,nz,car.heading,config)) {
      car.z = clamp(nz, bounds.minZ, bounds.maxZ);
    } else {
      collided = true; car.vz = 0; car.speed *= 0.25;
    }
    if (clearX<1 || clearZ<1) {
      car.speed=0;car.vx=0;car.vz=0;
      car.braking=true;
      car.crossingYield=true;
    }
    if (collided && impactSpeed >= 6 && impactCooldown <= 0) { impactSequence++; impactCooldown = 1; }

    const dx = car.x - startX, dz = car.z - startZ;
    const distance = dx * fx + dz * fz;
    updateSedanWheels(car, distance, dx * fz - dz * fx, yawTravel);
    updateWheelContact(car, dt);
    stepSedanRide(car.ride, (car.speed - startSpeed) / dt, distance * yawTravel / (dt * dt), dt);
  }

  function updateDrivingPhysics(dt) {
    const car = activeCar;
    const input = readVehicleInput(driveKeys, controls.getVirtualMove?.(), vehicleInput);
    const boxes = controls.getColliderBoxes();
    const vehicles = controls.getMovingColliderBoxes?.(car) ?? EMPTY_BOXES;
    const pedestrians=ctx.crossingVisitors ?? EMPTY_BOXES;
    const speedBefore=Math.abs(car.speed), wasYielding=car.crossingYield;
    car.crossingYield=false;
    // Screen-right steering turns toward local -X on a +Z-facing car.
    const steer = exitRequested ? 0 : -input.steer;
    const steps = Math.ceil(dt / PHYSICS_STEP);
    for (let i = 0; i < steps; i++) {
      stepDriving(car,input.throttle,steer,dt/steps,boxes,vehicles,pedestrians);
    }
    if (car.crossingYield) {
      car.braking=true;
      if (!wasYielding && speedBefore>2) playVehicleSound('brake');
    }
    car.stopLightMat.emissiveIntensity=car.braking ? 3.2 : isNight(getDayPhase()) ? .75 : 0;
    car.group.userData.crossingYield=car.crossingYield;
    car.group.userData.speed=car.speed;
    if (car.speedNeedle) car.speedNeedle.rotation.z=Math.PI*(.16+1.68*clamp(Math.abs(car.speed)*2.23694/50,0,1));
    car.group.position.set(car.x, ROAD_HEIGHT, car.z);
    car.group.rotation.y = car.heading;
    applySedanRide(car);
    setCarBounds(car.collider, car.x, car.z, car.heading, car);
  }

  function setChaseView(car) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const distance = CHASE_DIST + car.configuration.halfLength - LARGE_SEDAN.halfLength + Math.min(1.1, Math.abs(car.speed) * 0.05);
    const lift = car.ride.heave.value * 0.85;
    const lookIntoTurn = Math.sin(car.steeringAngle) * Math.min(2.4, Math.abs(car.speed) * 0.3);
    chasePosition.set(car.x - fx * distance, CHASE_HEIGHT + lift, car.z - fz * distance);
    chaseTarget.set(car.x + fx * 2.4 + fz * lookIntoTurn, 1.12 + lift, car.z + fz * 2.4 - fx * lookIntoTurn);
  }

  function setCameraNear(near) {
    if (camera.near === near) return;
    camera.near = near;
    camera.updateProjectionMatrix();
  }

  function positionCabinCamera(car) {
    // The seated detective fills the space between the seat and the lens.
    setCameraNear(CABIN_NEAR);
    const [x,y,z] = car.configuration.seatOffset;
    camera.position.set(.35+x,1.46+y,-.33+z);
    car.chassis.localToWorld(camera.position);
    cabinAim.set(.35+x+Math.sin(car.steeringAngle)*.74,.71+y,5.1+z);
    car.chassis.localToWorld(cabinAim);
    camera.lookAt(cabinAim);
  }

  function positionChaseCamera(dt) {
    setCameraNear(exteriorNear);
    const car = activeCar;
    setChaseView(car);
    const follow = 1 - Math.exp(-dt * 10);
    if (!chaseReady) {
      camera.position.copy(chasePosition);
      chaseAim.copy(chaseTarget);
    } else {
      camera.position.lerp(chasePosition, follow);
      chaseAim.lerp(chaseTarget, follow);
    }
    chaseReady = true;
    const clearance = clearCameraFraction(controls.getColliderBoxes(), car.x, car.z, camera.position.x, camera.position.z);
    camera.position.x = THREE.MathUtils.lerp(car.x, camera.position.x, clearance);
    camera.position.z = THREE.MathUtils.lerp(car.z, camera.position.z, clearance);
    camera.position.y = Math.max(CHASE_HEIGHT - 0.15, camera.position.y);
    camera.lookAt(chaseAim);
  }

  function updateEngineAudio() {
    if (!engine) return;
    const car = activeCar;
    const config = car?.configuration ?? LARGE_SEDAN;
    const speedFrac = car ? Math.min(1, Math.abs(car.speed) / config.maxSpeed) : 0;
    const throttling = isDriving && !access && !exitRequested ? Math.max(0, readVehicleInput(driveKeys, controls.getVirtualMove?.(), vehicleInput).throttle) : 0;
    const targetGain = isDriving ? 0.045 + speedFrac * 0.1 + throttling * 0.05 : 0.0;
    const targetFreq = config.idleNote + speedFrac * config.engineRange;
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
    update(dt, elapsed, rainfall = 0) {
      const inputBlocked = ctx.controls.isInputBlocked();
      for (const car of cars) {
        const occupied = car === activeCar && isDriving && !access;
        const cabin = occupied && cabinView;
        const reversed = car.windshield.update(dt,rainfall,cabin,occupied && car.wipersOn && !exitRequested);
        if (reversed && cabin && !inputBlocked) playVehicleSound('wiper');
      }
      if (inputBlocked) {
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
        c.dialInk.emissiveIntensity = on ? .45 : .045;
        c.stopLightMat.emissiveIntensity = c.braking ? 3.2 : on ? 0.75 : 0;
        for (const material of c.reflective) material.envMapIntensity = night ? 0.22 : 0.75;
      }

      updateEngineAudio();

      if (access) {
        updateVehicleAccess(dt);
      } else if (isDriving) {
        updateDrivingPhysics(dt);
        player.drive(activeCar);
        if (cabinView) positionCabinCamera(activeCar);
        else positionChaseCamera(dt);
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
    emitTireWater(emit) {
      if (isDriving && !access && !controls.isInputBlocked()) emit(activeCar,activeCar,cabinView);
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
      out.yielding = !!activeCar?.crossingYield;
      out.configuration = activeCar?.configuration;
      return out;
    },
    park() {
      if (activeCar) finishExit(...(safeExitPoint(activeCar) ?? [activeCar.x,activeCar.z]));
      else if (isRiding) exitTram();
    },
    dispose() {
      setCameraNear(exteriorNear);
      removeParkedVehicles?.();
      unregisterInteraction();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    },
  };
}
