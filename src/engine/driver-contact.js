import { MathUtils, Quaternion, Vector3 } from '../../vendor/three.module.min.js';
import { constrainLimb } from './limb-constraint.js';
import { contactWeight } from './vehicle-access.js';
import { DRIVER_MARK } from './vehicle-motion.mjs';

const UP = new Vector3(0, 1, 0);
const groundRotation = new Quaternion();
const tilt = new Vector3();
const posePoint = new Vector3();
const wrist = new Vector3();
const palmOffset = new Vector3();
const palmDirection = new Vector3();
const shoulder = new Vector3();
const palmAim = new Vector3();
const wristSwing = new Quaternion();
const wanted = new Vector3();
const worldOrientation = new Quaternion();
const levelOrientation = new Quaternion();

function limb(asset, side, names) {
  const [upper, lower, end] = names.map(name => asset.getObjectByName(name + '_' + side));
  return { upper, lower, end, anchor: new Vector3(), weight: 0, floor: false, sole: 0 };
}

export function createDriverContacts(asset, actor) {
  const hips = asset.getObjectByName('pelvis');
  const legs = {
    l: limb(asset, 'l', ['thigh', 'calf', 'foot']),
    r: limb(asset, 'r', ['thigh', 'calf', 'foot']),
  };
  const arms = {
    l: limb(asset, 'l', ['upperarm', 'lowerarm', 'hand']),
    r: limb(asset, 'r', ['upperarm', 'lowerarm', 'hand']),
  };
  for (const side of ['l', 'r']) {
    arms[side].knuckle = asset.getObjectByName('middle_01_' + side);
    // The idle pose was fitted to the bottom of these shoes in Blender.
    legs[side].end.getWorldPosition(posePoint);
    legs[side].sole = actor.worldToLocal(posePoint).y * actor.scale.y;
  }
  const chains = [...Object.values(legs), ...Object.values(arms)];
  const changed = [hips, ...chains.flatMap(chain => [chain.upper, chain.lower, chain.end])];
  const pose = changed.map(bone => ({ bone, position: new Vector3(), rotation: new Quaternion() }));
  const arrivalOffset = new Vector3();
  let constrained = false;

  function rememberPose() {
    for (const item of pose) {
      item.position.copy(item.bone.position);
      item.rotation.copy(item.bone.quaternion);
    }
    constrained = true;
  }

  function moveHips(x, y, z) {
    hips.getWorldPosition(posePoint);
    posePoint.x += x;
    posePoint.y += y;
    posePoint.z += z;
    hips.position.copy(hips.parent.worldToLocal(posePoint));
  }

  function plantFoot(leg) {
    leg.end.getWorldPosition(posePoint);
    wanted.copy(posePoint).lerp(leg.anchor, leg.weight);
    leg.end.getWorldQuaternion(worldOrientation);
    if (leg.floor) {
      levelOrientation.copy(groundRotation).multiply(worldOrientation);
      worldOrientation.slerp(levelOrientation, leg.weight);
    }
    constrainLimb(leg.upper, leg.lower, leg.end, wanted, worldOrientation);
  }

  return {
    restore() {
      if (!constrained) return;
      for (const item of pose) {
        item.bone.position.copy(item.position);
        item.bone.quaternion.copy(item.rotation);
      }
      constrained = false;
    },
    hipPosition(target) { return hips.getWorldPosition(target); },
    alignFrom(start) {
      arrivalOffset.subVectors(start, hips.getWorldPosition(posePoint));
      // Vertical alignment comes from the two planted feet.
      arrivalOffset.y = 0;
    },
    groundWalk(heightAt) {
      rememberPose();
      groundRotation.identity();
      for (const leg of Object.values(legs)) {
        leg.end.getWorldPosition(leg.anchor);
        const difference = heightAt(leg.anchor.x, leg.anchor.z) - actor.position.y;
        if (Math.abs(difference) < 0.001) continue;
        leg.anchor.y += difference;
        leg.weight = 1;
        leg.floor = false;
        plantFoot(leg);
      }
    },
    access(car, motion, frame, heightAt) {
      rememberPose();
      const side = motion.side;
      const hardware = car.accessDoors[side];
      const landing = car.configuration.driverMark;
      const correctSide = leg => side > 0 ? leg : leg === 'l' ? 'r' : 'l';
      for (const leg of Object.values(legs)) leg.weight = 0;
      let rise = 0;
      let supporting = 0;
      for (const [legName, surface, x, z, from, to] of motion.feet) {
        const weight = contactWeight(frame, from, to);
        if (!weight) continue;
        const leg = legs[correctSide(legName)];
        leg.weight = weight;
        leg.floor = surface === 'street';
        if (leg.floor) {
          car.group.localToWorld(leg.anchor.set(side*(x+landing.x-DRIVER_MARK.x),0,z+landing.z-DRIVER_MARK.z));
          leg.anchor.y = heightAt(leg.anchor.x, leg.anchor.z) + leg.sole;
          rise += (leg.anchor.y - leg.end.getWorldPosition(posePoint).y) * weight;
          supporting += weight;
        } else {
          const step = hardware.step.position;
          car.chassis.localToWorld(leg.anchor.set(step.x+side*(x-.99),step.y+leg.sole,step.z+z-.02));
        }
      }
      const blend = motion.clip === 'Board' ? 1 - MathUtils.smoothstep(frame, 0, 7) : 0;
      moveHips(arrivalOffset.x * blend,
        arrivalOffset.y * blend + 0.78 * rise / Math.max(1, supporting),
        arrivalOffset.z * blend);
      car.chassis.getWorldQuaternion(groundRotation);
      tilt.copy(UP).applyQuaternion(groundRotation);
      groundRotation.setFromUnitVectors(tilt, UP);
      for (const leg of Object.values(legs)) {
        if (leg.weight) plantFoot(leg);
      }

      for (const [armName, handle, from, to] of motion.hands) {
        const weight = contactWeight(frame, from, to, 4);
        if (!weight) continue;
        const arm = arms[correctSide(armName)];
        arm.end.getWorldPosition(wrist);
        palmOffset.copy(arm.knuckle.getWorldPosition(posePoint)).sub(wrist).multiplyScalar(0.67);
        hardware[handle].getWorldPosition(wanted);
        arm.upper.getWorldPosition(shoulder);
        palmAim.subVectors(wanted, shoulder).normalize();
        palmDirection.copy(palmOffset).normalize();
        palmAim.lerp(palmDirection, 1 - 0.90 * weight).normalize();
        wristSwing.setFromUnitVectors(palmDirection, palmAim);
        arm.end.getWorldQuaternion(worldOrientation).premultiply(wristSwing);
        wanted.sub(palmOffset.applyQuaternion(wristSwing)).lerp(wrist, 1 - weight);
        constrainLimb(arm.upper, arm.lower, arm.end, wanted, worldOrientation);
      }
    },
  };
}
