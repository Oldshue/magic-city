import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { clone } from '../../vendor/addons/utils/SkeletonUtils.js';
import { findCounterFace, updateCounterFace } from './counter-face.js';
import { createWalkFootContacts } from './walk-foot-contacts.js';

const MODELS = ['bank-clerk','shopkeeper','street-worker','pharmacist','crown-proprietor','ledger-vendor','walker-tailor'];
const TINTS = [0xb09774,0x977655,0x919592,0x9d714f,0x767a64,0xa77878,0x737f9e,0x817451];
const STRIDE_SPEED = 1.10;

export function prepareCharacter(asset) {
  asset.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const material = object.material;
    if (/hair|eyebrow|eyelash|short01/i.test(material.name) && material.transparent) {
      material.alphaTest = 0.44;
      material.transparent = false;
      material.depthWrite = true;
      material.needsUpdate = true;
    }
  });
}

export function in20thStreetBlock(x, z) {
  return Math.abs(x) < 24 && z > 6 && z < 58;
}

export function inHeaviestCorner(x,z) {
  return z > -41 && z <= 6 && (Math.abs(x) < 24 || (Math.abs(x) < 49 && Math.abs(z) < 16));
}

/**
 * Reuse the living city's positions and behaviours with a detailed rig near
 * the camera. The existing instanced crowd still covers the rest of the city.
 */
export function createStreetCharacters({THREE, scene, camera}) {
  const loader = new GLTFLoader();
  const root = new THREE.Group();
  root.name = '20th Street characters';
  scene.add(root);
  const models = new Map();
  const tinted = new WeakMap();
  const hand = new THREE.Vector3();
  const knuckle = new THREE.Vector3();
  function loadModel(name) {
    if (models.has(name) || !MODELS.includes(name)) return models.get(name);
    models.set(name,null);
    const version = name==='shopkeeper' || name==='bank-clerk' ? '?v=window-shopping' : '';
    loader.loadAsync('./data/art/' + name + '.glb'+version).then(({scene:asset,animations})=>{
      if (!animations.find(clip=>clip.name==='Idle') || !animations.find(clip=>clip.name==='Walk')) {
        throw new Error('Idle and Walk clips are required');
      }
      prepareCharacter(asset);
      models.set(name,{asset,animations,slots:[]});
    }).catch(error=>console.warn('[magic-city] Character mesh '+name+' is unavailable:',error.message));
    return null;
  }

  function wear(slot,palette) {
    for (const [mesh,material] of slot.wardrobe) {
      if (palette===undefined) {
        mesh.material=material;
        continue;
      }
      let wardrobe = tinted.get(material);
      if (!wardrobe) {
        wardrobe=new Map();
        tinted.set(material,wardrobe);
      }
      let dyed=wardrobe.get(palette);
      if (!dyed) {
        dyed=material.clone();
        dyed.color.lerp(new THREE.Color(TINTS[palette]),.54);
        wardrobe.set(palette,dyed);
      }
      mesh.material=dyed;
    }
  }
  let frame = 0;

  function useSlot(model, name, personIndex, person) {
    let slot = model.slots.find(candidate => candidate.personIndex === personIndex);
    if (slot) return slot;
    slot = model.slots.find(candidate => candidate.frame < frame - 1);
    if (!slot) {
      const instance = clone(model.asset);
      instance.name = name;
      root.add(instance);
      const mixer = new THREE.AnimationMixer(instance);
      const clips = new Map(model.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
      const wardrobe = [];
      instance.traverse(mesh=>{
        if (mesh.isMesh && /suit|fedora|felt/i.test(mesh.material.name)) wardrobe.push([mesh,mesh.material]);
      });
      slot = {instance,mixer,clips,wardrobe,face:findCounterFace(instance),
        headRotation:new THREE.Quaternion(), head:instance.getObjectByName('head'),hand:instance.getObjectByName('hand_r'),finger:instance.getObjectByName('middle_01_r')};
      model.slots.push(slot);
    }
    slot.feet?.restore();
    slot.feet?.clear();
    slot.mixer.stopAllAction();
    slot.headAdjusted = false;
    slot.instance.userData.person = person.actor?.id ?? person.id ?? name;
    wear(slot,person.actor ? person.actor.palette : person.paletteIdx);
    slot.personIndex = personIndex;
    slot.active = null;
    return slot;
  }

  return {
    beginFrame() { frame++; },

    show(index, person, x, z, facing, floor, moving, dt) {
      if (person.prop || (!person.actor?.model && !in20thStreetBlock(x,z) && !inHeaviestCorner(x,z))) return false;
      const authored = person.actor?.model ?? person.model;
      if (!authored && person.actor) return false;
      const range = authored ? 32 : 22;
      const dx = camera.position.x - x, dz = camera.position.z - z;
      if (dx * dx + dz * dz > range * range || Math.abs(camera.position.y - floor) > 6) return false;
      const name = authored ?? (person.hatStyle===1 ? 'shopkeeper' : person.paletteIdx%3===0 ? 'street-worker' : 'bank-clerk');
      const model = loadModel(name);
      if (!model) return false;
      const slot = useSlot(model,name,index,person);
      const cue = person.actor?.performance;
      const visit = person.visit?.pose;
      const browsing = visit?.inspection;
      const controlled = cue ? slot.clips.get(cue.clip)
        : browsing!=null ? slot.clips.get('Browse') : null;
      const walk = slot.clips.get('Walk');
      const action = controlled || (moving ? walk : slot.clips.get('Idle'));
      slot.feet?.restore();
      if (slot.headAdjusted) slot.head.quaternion.copy(slot.headRotation);
      if (slot.active !== action) {
        action.reset().play();
        action.time = (person.bob*.133)%action.getClip().duration;
        if (slot.active) action.crossFadeFrom(slot.active,.16,false);
        slot.active=action;
      }
      action.paused=!!controlled;
      if (controlled) action.time=action.getClip().duration*Math.min(.99999,cue?.phase ?? browsing);
      else if (moving) {
        const speed = person.strideSpeed ?? person.actor?.speed ?? person.speed ?? STRIDE_SPEED;
        action.setEffectiveTimeScale((speed || STRIDE_SPEED)/(STRIDE_SPEED*person.scale));
      }

      slot.instance.position.set(x,floor,z);
      slot.instance.rotation.y=facing;
      slot.instance.scale.setScalar(person.scale);
      slot.instance.visible=true;
      slot.mixer.update(dt);
      if (person.walkingBlock) {
        const gait = action===walk ? walk.time/walk.getClip().duration : null;
        if (gait!=null) {
          slot.feet ??= createWalkFootContacts(slot.instance);
          if (slot.frame < frame-1) slot.feet.clear();
          slot.feet.apply(gait);
        } else {
          slot.feet?.clear();
        }
        slot.instance.userData.activity = visit?.phase ?? 'walking';
        slot.instance.userData.motion = action.getClip().name;
        slot.instance.userData.gait = gait;
      }
      if (slot.face) updateCounterFace(slot.face,person.actor,dt);
      const metVisitor = person.actor?.lookAtVisitor && dx*dx+dz*dz<23;
      const passedVisitor = moving && dx*dx+dz*dz<17;
      const glance=visit?.glance ?? 0;
      const lookAtWindow=glance>.001;
      slot.headAdjusted=Boolean(slot.head && (lookAtWindow || person.actor?.attending || metVisitor || passedVisitor));
      if (slot.headAdjusted) {
        slot.headRotation.copy(slot.head.quaternion);
        if (lookAtWindow) {
          const {x:wx,y:wy,z:wz} = person.visit.target;
          const yaw = Math.atan2(wx-x,wz-z)-facing;
          const angle = THREE.MathUtils.euclideanModulo(yaw+Math.PI,Math.PI*2)-Math.PI;
          const pitch = Math.atan2(floor+1.61*person.scale-wy,Math.hypot(wx-x,wz-z));
          slot.head.rotateY(glance*THREE.MathUtils.clamp(angle,-.78,.78));
          slot.head.rotateX(glance*THREE.MathUtils.clamp(pitch,-.15,.19));
        } else {
          const angle=THREE.MathUtils.euclideanModulo(Math.atan2(dx,dz)-facing+Math.PI,Math.PI*2)-Math.PI;
          slot.head.rotateY(THREE.MathUtils.clamp(angle*.65,-.53,.53));
        }
      }
      const fabric = person.actor?.fabricContact;
      if (fabric && slot.hand && slot.finger) {
        slot.hand.getWorldPosition(hand);
        hand.lerp(slot.finger.getWorldPosition(knuckle), .67);
        fabric.followHand(hand);
      }
      const held=person.actor?.carries;
      if (held && slot.hand) {
        slot.hand.getWorldPosition(hand);
        held.parent.worldToLocal(hand);
        held.position.copy(hand);
        held.position.y=Math.max(held.userData.restHeight,hand.y-(held.userData.gripOffset ?? .067));
      }
      slot.frame=frame;
      return true;
    },

    endFrame() {
      for (const model of models.values()) {
        if (!model) continue;
        for (const slot of model.slots) {
          if (slot.frame !== frame) slot.instance.visible = false;
        }
      }
    },
  };
}
