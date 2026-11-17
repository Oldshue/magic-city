import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { prepareCharacter } from './street-characters.js';
import { clone } from '../../vendor/addons/utils/SkeletonUtils.js';
import { createDriverContacts } from './driver-contact.js';

const SCALE = .94;
const WALK_SPEED = 1.10;
let driverSource;

function loadDriver() {
  driverSource ??= new GLTFLoader().loadAsync('./data/art/detective.glb?v=boarding').then(source=>{
    prepareCharacter(source.scene);
    return source;
  });
  return driverSource;
}

/** The same detective steps into the cabin, grips the wheel and steps out. */
export function createDriverPerformer(scene,{motoristColor}={}) {
  const group = new THREE.Group();
  group.name = motoristColor === undefined ? 'Playable detective' : 'Traffic motorist';
  group.scale.setScalar(SCALE);
  group.visible = false;
  scene.add(group);
  const actions = new Map();
  let mixer, active, waiting, contacts;
  const arrival = new THREE.Vector3();
  loadDriver().then(({scene:source,animations})=>{
    const asset = clone(source);
    if (motoristColor !== undefined) {
      const tint = new THREE.Color(motoristColor);
      asset.traverse(object=>{
        if (!object.isMesh) return;
        object.castShadow = false;
        if (/suit_tie|fedora/i.test(object.material.name)) {
          object.material = object.material.clone();
          object.material.color.lerp(tint,.37);
        }
      });
    }
    group.add(asset);
    mixer = new THREE.AnimationMixer(asset);
    for (const name of ['Idle','Walk','Board','Disembark','DisembarkPassenger','Steer']) {
      const clip = animations.find(item=>item.name === name);
      if (!clip) throw new Error('Missing ' + name + ' animation');
      actions.set(name,mixer.clipAction(clip));
    }
    if (motoristColor === undefined) {
      const idle = actions.get('Idle');
      idle.play();
      mixer.update(0);
      contacts = createDriverContacts(asset, group);
      idle.stop();
    }
    if (waiting) play(waiting.name,waiting.pose,0);
    waiting = null;
  }).catch(error=>console.warn('[magic-city] The detective mesh is unavailable:', error.message));

  function play(name, pose, dt) {
    contacts?.restore();
    const next = actions.get(name);
    if (!next) {
      waiting = {name,pose};
      return false;
    }
    if (active !== next) {
      active?.stop();
      next.reset().play();
      active = next;
    }
    next.paused = pose !== null;
    if (pose !== null) next.time = next.getClip().duration * Math.min(0.999999,pose);
    mixer.update(dt);
    group.userData.motion = name;
    return true;
  }

  function mount(car) {
    if (group.parent !== car.chassis) car.chassis.add(group);
    group.position.set(0,0,0);
    group.rotation.y = 0;
    group.visible = true;
  }

  return {
    approach(x, z, heading, speed, dt, heightAt) {
      if (group.parent !== scene) scene.add(group);
      group.position.set(x, heightAt(x, z), z);
      group.rotation.y = heading;
      group.visible = true;
      const walk = actions.get('Walk');
      if (walk) walk.timeScale = speed / (SCALE * WALK_SPEED);
      if (play(speed > 0.02 ? 'Walk' : 'Idle', null, dt)) contacts?.groundWalk(heightAt);
    },
    access(car, motion, phase, heightAt) {
      const align = contacts && motion.clip === 'Board' && group.visible && group.parent !== car.chassis;
      if (align) contacts.hipPosition(arrival);
      mount(car);
      if (!play(motion.clip, phase, 0)) return;
      if (align) contacts.alignFrom(arrival);
      const frame = phase * motion.frames - motion.slide;
      group.userData.accessFrame = frame;
      contacts?.access(car, motion, frame, heightAt);
    },
    drive(car) {
      mount(car);
      const grip = THREE.MathUtils.clamp(.5 + car.steeringWheel.rotation.z/(2*.693),0,1);
      play('Steer',grip,0);
    },
    hide() {
      group.visible = false;
      contacts?.restore();
      waiting = null;
      active?.stop();
      active = null;
    },
  };
}
