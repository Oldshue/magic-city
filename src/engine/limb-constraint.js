import { Quaternion, Vector3 } from '../../vendor/three.module.min.js';

const origin = new Vector3();
const joint = new Vector3();
const tip = new Vector3();
const reach = new Vector3();
const bend = new Vector3();
const wantedJoint = new Vector3();
const wantedTip = new Vector3();
const fromDirection = new Vector3();
const toDirection = new Vector3();
const swing = new Quaternion();
const worldRotation = new Quaternion();
const parentInverse = new Quaternion();
const tipRotation = new Quaternion();

function setWorldRotation(bone, orientation) {
  bone.parent.getWorldQuaternion(parentInverse).invert();
  bone.quaternion.copy(parentInverse.multiply(orientation));
  bone.updateWorldMatrix(false, false);
}

function aim(bone, start, current, target) {
  swing.setFromUnitVectors(
    fromDirection.subVectors(current, start).normalize(),
    toDirection.subVectors(target, start).normalize(),
  );
  bone.getWorldQuaternion(worldRotation).premultiply(swing);
  setWorldRotation(bone, worldRotation);
}

/** Reach a world-space contact with two bone rotations, preserving bone length. */
export function constrainLimb(upper, lower, endpoint, target, orientation, pole) {
  upper.getWorldPosition(origin);
  lower.getWorldPosition(joint);
  endpoint.getWorldPosition(tip);
  const firstLength = origin.distanceTo(joint);
  const secondLength = joint.distanceTo(tip);
  const distance = reach.subVectors(target, origin).length();
  if (distance < 1e-6 || firstLength < 1e-6 || secondLength < 1e-6) return;

  reach.multiplyScalar(1 / distance);
  if (pole) bend.copy(pole);
  else bend.subVectors(joint, origin);
  bend.addScaledVector(reach, -bend.dot(reach));
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(reach.y) > 0.9 ? 1 : 0, Math.abs(reach.y) > 0.9 ? 0 : 1, 0);
    bend.addScaledVector(reach, -bend.dot(reach));
  }
  bend.normalize();

  const length = Math.max(Math.abs(firstLength - secondLength) + 0.001,
    Math.min(distance, firstLength + secondLength - 0.001));
  const projection = (firstLength ** 2 + length ** 2 - secondLength ** 2) / (2 * length);
  const flexion = Math.sqrt(Math.max(0, firstLength ** 2 - projection ** 2));
  wantedJoint.copy(origin).addScaledVector(reach, projection).addScaledVector(bend, flexion);
  wantedTip.copy(origin).addScaledVector(reach, length);
  if (orientation) tipRotation.copy(orientation);
  else endpoint.getWorldQuaternion(tipRotation);

  aim(upper, origin, joint, wantedJoint);
  lower.getWorldPosition(joint);
  endpoint.getWorldPosition(tip);
  aim(lower, joint, tip, wantedTip);
  setWorldRotation(endpoint, tipRotation);
}
