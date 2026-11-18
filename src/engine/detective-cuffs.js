import * as THREE from '../../vendor/three.module.min.js';
import { batch } from './vehicle-geometry.js';
import { shadeCharacterMaterial } from './character-surfaces.js';

/** Fit the cotton shirt ends to the detective's skinned hand sockets. */
export function addDetectiveCuffs(asset) {
  const cotton = new THREE.MeshStandardMaterial({name:'Shirt cotton',color:0xd5c9ab,roughness:.89});
  shadeCharacterMaterial(cotton);
  for (const [side,label] of [['l','Left shirt cuff'],['r','Right shirt cuff']]) {
    const hand = asset.getObjectByName('hand_' + side);
    const middle = asset.getObjectByName('middle_01_' + side);
    const index = asset.getObjectByName('index_01_' + side);
    const pinky = asset.getObjectByName('pinky_01_' + side);
    if (!hand || !middle || !index || !pinky) continue;
    const center = new THREE.Vector3();
    const advance = hand.worldToLocal(middle.getWorldPosition(center)).normalize();
    const thumbSide = hand.worldToLocal(index.getWorldPosition(new THREE.Vector3()))
      .sub(hand.worldToLocal(pinky.getWorldPosition(new THREE.Vector3())));
    thumbSide.addScaledVector(advance,-thumbSide.dot(advance)).normalize();
    const normal = new THREE.Vector3().crossVectors(thumbSide,advance);

    const cuff = new THREE.Group();
    cuff.name = label;
    cuff.position.copy(advance).multiplyScalar(.021);
    cuff.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumbSide,advance,normal));
    hand.add(cuff);

    const band = new THREE.CylinderGeometry(.0265,.029,.035,24,1,true).scale(1,1,.76);
    const hem = new THREE.TorusGeometry(.0262,.00135,6,24).rotateX(Math.PI/2).scale(1,1,.76).translate(0,.016,0);
    const button = new THREE.SphereGeometry(.0036,10,6).scale(1,1,.58).translate(.013,.004,.019);
    batch(cuff,[band,hem,button],cotton,false);
  }
}
