import { PLAYER_RADIUS } from '../engine/controls.js';
import { approachesDoor, occupiesDoorway, ENTRANCE_THICKNESS } from '../engine/shop-entrance-motion.mjs';
import { setCarBounds } from '../engine/vehicle-motion.mjs';
import { getAudio, makeNoiseBuffer, makeRng } from './audioBus.js';

const PATRON_RADIUS = .28;
const BELL_TONE = 932;

export function startShopEntrances(ctx,driving) {
  const { THREE, camera, controls, shopEntrances } = ctx;
  if (!shopEntrances?.length) return null;
  const walking = {};
  const sample = new THREE.Vector3(), previous = new THREE.Vector3();
  const center = new THREE.Vector3(), axis = new THREE.Vector3();
  const world = new THREE.Quaternion(), direction = new THREE.Vector3();
  const last = camera.position.clone();
  const guestSteps = new WeakMap();
  const states = shopEntrances.map((door,i)=>({
    door, pitch:1+i*.047, collider:{},
    bounds:{configuration:{halfWidth:ENTRANCE_THICKNESS*.5,halfLength:door.width*.5}},
  }));
  controls.addMovingColliders(states.map(state=>state.collider));
  let latchNoise;

  function placeCollider(state) {
    const {door,collider,bounds} = state;
    door.leaf.localToWorld(center.set(door.width*.5,0,0));
    door.leaf.getWorldQuaternion(world);
    axis.set(1,0,0).applyQuaternion(world);
    setCarBounds(collider,center.x,center.z,Math.atan2(axis.x,axis.z),bounds);
  }
  for (const state of states) placeCollider(state);

  function playDoorSound(state,event) {
    const bus = getAudio();
    if (!bus) return;
    state.door.bell.getWorldPosition(center);
    const dx = center.x-camera.position.x, dz = center.z-camera.position.z;
    const distance = Math.hypot(dx,center.y-camera.position.y,dz);
    const attenuation = 1-THREE.MathUtils.smoothstep(distance,1.2,13);
    if (!attenuation) return;
    const ac = bus.ctx, now = ac.currentTime;
    const pan = ac.createStereoPanner?.() ?? ac.createGain();
    camera.getWorldDirection(direction);
    if (pan.pan) pan.pan.value = THREE.MathUtils.clamp((direction.x*dz-direction.z*dx)/Math.max(1.8,Math.hypot(dx,dz)),-.9,.9);
    pan.connect(bus.master);
    if (event === 'latch') {
      latchNoise ??= makeNoiseBuffer(ac,.12,makeRng(0x801929));
      const click = ac.createBufferSource();
      click.buffer = latchNoise;
      const filter = ac.createBiquadFilter();
      filter.type='lowpass';
      filter.frequency.value=1090;
      const volume = ac.createGain();
      volume.gain.setValueAtTime(.105*attenuation,now);
      volume.gain.exponentialRampToValueAtTime(.0001,now+.099);
      click.connect(filter).connect(volume).connect(pan);
      click.onended = ()=>pan.disconnect();
      click.start();
      return;
    }

    // The hanging bell gets the first strike and a much softer return strike.
    const modes = [[1,.090,.63],[2.16,.043,.38],[3.51,.018,.25],[4.91,.010,.13]];
    for (const [i,[ratio,amp,length]] of modes.entries()) {
      const tone = ac.createOscillator(), volume = ac.createGain();
      const start = now + .003*i;
      tone.frequency.setValueAtTime(BELL_TONE*ratio*state.pitch,start);
      volume.gain.setValueAtTime(.0001,start);
      volume.gain.linearRampToValueAtTime(amp*attenuation,start+.004);
      volume.gain.exponentialRampToValueAtTime(.0001,start+length);
      tone.connect(volume).connect(pan);
      tone.start(start);
      tone.stop(start+length+.02);
      if (i===0) tone.onended = ()=>pan.disconnect();
    }
    const bounce = ac.createOscillator(), volume = ac.createGain();
    bounce.frequency.setValueAtTime(BELL_TONE*2.16*state.pitch,now+.084);
    volume.gain.setValueAtTime(.018*attenuation,now+.086);
    volume.gain.exponentialRampToValueAtTime(.0001,now+.33);
    bounce.connect(volume).connect(pan);
    bounce.start(now+.084);
    bounce.stop(now+.35);
  }

  function observe(state,x,z,fromX,fromZ,clearance,guest,dt) {
    const {door} = state;
    door.shop.worldToLocal(sample.set(x,0,z));
    door.shop.worldToLocal(previous.set(fromX,0,fromZ));
    const across = sample.x-door.hingeX, depth = sample.z-door.hingeZ;
    const step = sample.z-previous.z;
    const asks = (!guest || depth<0) && approachesDoor(across,depth,step,door.width);
    state.requested ||= asks;
    state.occupied ||= occupiesDoorway(across,depth,clearance,door.width);
    if (!guest) return;

    const raising = depth > 0 && depth < 1.08 && Math.abs(across-door.width*.54) < .47
      && door.motion.angle < .76 && (step < -.001 || guest.touching);
    const touch = raising ? (
      (1-THREE.MathUtils.smoothstep(depth,.70,1.04)) *
      (1-THREE.MathUtils.smoothstep(door.motion.angle,.31,.76))
    ) : 0;
    guest.touching = raising;
    guest.press.amount = THREE.MathUtils.damp(guest.press.amount,touch,18,dt);
  }

  return {update(dt) {
    const ride = driving?.getState(walking);
    const onFoot = !ride?.mounted && !ride?.riding && camera.position.y < 2.65;
    if (Math.hypot(last.x-camera.position.x,last.z-camera.position.z)>1.8) last.copy(camera.position);
    for (const state of states) {
      const {door} = state;
      state.requested = door.requested;
      door.requested = false;
      state.occupied = false;
      if (onFoot) observe(state,camera.position.x,camera.position.z,last.x,last.z,PLAYER_RADIUS*.74);
      for (const guest of door.guests) {
        const [x,z] = guest.position;
        let before = guestSteps.get(guest);
        if (!before) {
          before = {x,z,touching:false,press:{target:door.plate,amount:0}};
          guestSteps.set(guest,before);
          guest.entrancePress = before.press;
        }
        observe(state,x,z,before.x,before.z,PATRON_RADIUS,before,dt);
        before.x = x;
        before.z = z;
      }

      const event = door.motion.update(dt,state.requested,state.occupied);
      if (door.leaf.rotation.y !== door.motion.angle) {
        door.leaf.rotation.y = door.motion.angle;
        placeCollider(state);
      }
      const beat = door.motion.bell;
      door.bell.rotation.z = beat<.97 ? .28*Math.sin(beat*32)*Math.exp(-5.4*beat) : 0;
      if (event) playDoorSound(state,event);
    }
    last.copy(camera.position);
  }};
}
