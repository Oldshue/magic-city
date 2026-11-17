import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { clone } from '../../vendor/addons/utils/SkeletonUtils.js';

const MODELS = ['bank-clerk', 'shopkeeper'];
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
  for (const name of MODELS) {
    loader.loadAsync('./data/art/' + name + '.glb').then(({scene:asset, animations}) => {
      const idle = animations.find(clip => clip.name === 'Idle');
      const walk = animations.find(clip => clip.name === 'Walk');
      if (!idle || !walk) throw new Error('Idle and Walk clips are required');
      prepareCharacter(asset);
      models.set(name, {asset, idle, walk, slots:[]});
    }).catch(error => console.warn('[magic-city] Character mesh ' + name + ' is unavailable:', error.message));
  }
  let frame = 0;

  function useSlot(model, name, personIndex) {
    let slot = model.slots.find(candidate => candidate.personIndex === personIndex);
    if (slot) return slot;
    slot = model.slots.find(candidate => candidate.frame < frame - 1);
    if (!slot) {
      const instance = clone(model.asset);
      instance.name = name;
      root.add(instance);
      const mixer = new THREE.AnimationMixer(instance);
      slot = {instance, mixer, idle:mixer.clipAction(model.idle), walk:mixer.clipAction(model.walk)};
      model.slots.push(slot);
    }
    slot.mixer.stopAllAction();
    slot.personIndex = personIndex;
    slot.active = null;
    return slot;
  }

  return {
    beginFrame() { frame++; },

    show(index, person, x, z, facing, floor, moving, dt) {
      if (person.prop || !in20thStreetBlock(x, z)) return false;
      const authored = person.actor?.model ?? person.model;
      if (!authored && person.actor) return false;
      const range = authored ? 32 : 22;
      const dx = camera.position.x - x, dz = camera.position.z - z;
      if (dx * dx + dz * dz > range * range || Math.abs(camera.position.y - floor) > 6) return false;
      const name = authored ?? MODELS[person.hatStyle === 1 ? 1 : 0];
      const model = models.get(name);
      if (!model) return false;
      const slot = useSlot(model, name, index);
      const action = moving ? slot.walk : slot.idle;
      if (slot.active !== action) {
        action.reset().play();
        action.time = (person.bob * 0.133) % action.getClip().duration;
        if (slot.active) action.crossFadeFrom(slot.active, 0.19, false);
        slot.active = action;
      }
      if (moving) slot.walk.setEffectiveTimeScale((person.speed || STRIDE_SPEED) / (STRIDE_SPEED * person.scale));

      slot.instance.position.set(x, floor, z);
      slot.instance.rotation.y = facing;
      slot.instance.scale.setScalar(person.scale);
      slot.instance.visible = true;
      slot.mixer.update(dt);
      slot.frame = frame;
      return true;
    },

    endFrame() {
      for (const model of models.values()) {
        for (const slot of model.slots) {
          if (slot.frame !== frame) slot.instance.visible = false;
        }
      }
    },
  };
}
