import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Group, Quaternion, Vector3 } from '../vendor/three.module.min.js';
import { constrainLimb } from '../src/engine/limb-constraint.js';
import { createDriverContacts } from '../src/engine/driver-contact.js';
import { contactWeight, DOOR_OPEN_ANGLE, doorAngle, ENTRY, exitMotion } from '../src/engine/vehicle-access.js';

test('a planted joint reaches a world point on a tilted chassis at its original bone lengths', () => {
  const frame = new Group();
  frame.rotation.set(0.08, 2.7, -0.10);
  frame.position.set(-10, 0.16, 40);
  frame.scale.setScalar(0.94);
  const upper = new Bone(), lower = new Bone(), end = new Bone();
  frame.add(upper); upper.add(lower); lower.add(end);
  lower.position.set(0, 0.39, 0);
  lower.rotation.z = 0.34;
  end.position.set(0, 0.43, 0);
  const target = frame.localToWorld(new Vector3(0.28, 0.64, 0.15));
  const upright = new Quaternion();
  constrainLimb(upper, lower, end, target, upright);
  const a = upper.getWorldPosition(new Vector3());
  const b = lower.getWorldPosition(new Vector3());
  const c = end.getWorldPosition(new Vector3());
  assert.ok(c.distanceTo(target) < 1e-6);
  assert.ok(Math.abs(a.distanceTo(b) - 0.39 * 0.94) < 1e-6);
  assert.ok(Math.abs(b.distanceTo(c) - 0.43 * 0.94) < 1e-6);
  assert.ok(end.getWorldQuaternion(new Quaternion()).angleTo(upright) < 1e-6);
  constrainLimb(upper, lower, end, target.set(-11, -4, 12));
  assert.ok(Math.abs(a.distanceTo(end.getWorldPosition(c)) - (0.82 * 0.94 - 0.001)) < 1e-6);
});

test('contact and door timings hold through the step and mirror across the cabin', () => {
  assert.equal(doorAngle(ENTRY, 19) < -1, true);
  assert.equal(doorAngle(ENTRY, 26), -DOOR_OPEN_ANGLE);
  assert.ok(Math.abs(doorAngle(ENTRY, 54)) < 1e-6);
  assert.equal(contactWeight(24, 25, 35) < 1, true);
  assert.equal(contactWeight(26, 25, 35), 1);
  assert.equal(contactWeight(39, 25, 35), 0);
  assert.equal(exitMotion(-1).frames - exitMotion(-1).slide, exitMotion(1).frames);
  assert.equal(doorAngle(exitMotion(-1), 33), DOOR_OPEN_ANGLE);
  assert.ok(Math.abs(doorAngle(exitMotion(-1), -2)) < 1e-6);
});

test('the shipped detective rig contains each timed entry or exit action', () => {
  const bytes = readFileSync(new URL('../data/art/detective.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  for (const motion of [ENTRY, exitMotion(1), exitMotion(-1)]) {
    const clip = gltf.animations.find(item => item.name === motion.clip);
    assert.ok(clip, motion.clip);
    const seconds = Math.max(...clip.samplers.map(sampler => gltf.accessors[sampler.input].max[0]));
    assert.ok(Math.abs(seconds - motion.frames / 30) < 1e-4, motion.clip);
  }
});

test('a rotating rim keeps the palm and wrist orientation locked through both turns', () => {
  function joint(parent,name,x,y,z) {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(x,y,z);
    parent.add(bone);
    return bone;
  }

  const cabin = new Group();
  cabin.position.set(9.3,.02,36);
  cabin.rotation.set(.04,Math.PI,-.05);
  const actor = new Group(), wheel = new Group();
  actor.scale.setScalar(.94);
  wheel.rotation.x = -.38;
  wheel.userData.rimRadius = .152;
  cabin.add(actor,wheel);
  joint(actor,'pelvis',0,-.2,-.25);
  const hands = [];
  for (const [side,sign] of [['l',1],['r',-1]]) {
    const thigh = joint(actor,'thigh_'+side,.14*sign,-.25,-.24);
    const calf = joint(thigh,'calf_'+side,0,-.14,.32);
    joint(calf,'foot_'+side,0,-.34,-.08);
    const shoulder = joint(actor,'upperarm_'+side,.23*sign,-.07,-.20);
    const elbow = joint(shoulder,'lowerarm_'+side,-.065*sign,.19,.10);
    const wrist = joint(elbow,'hand_'+side,-.055*sign,.047,.19);
    const palm = joint(wrist,'middle_01_'+side,-.056*sign,.022,.081);
    hands.push({wrist,palm});
  }

  const contacts = createDriverContacts(actor,actor);
  contacts.fitWheelGrip(wheel);
  function measure(hand) {
    const palm = hand.wrist.getWorldPosition(new Vector3()).lerp(hand.palm.getWorldPosition(new Vector3()),.53);
    const rotation = wheel.getWorldQuaternion(new Quaternion()).invert()
      .multiply(hand.wrist.getWorldQuaternion(new Quaternion()));
    return {palm:wheel.worldToLocal(palm),rotation,curl:hand.palm.quaternion.clone()};
  }
  contacts.gripWheel(wheel,1);
  const straight = hands.map(measure);
  for (const angle of [-.68, .68, 0]) {
    contacts.restore();
    wheel.rotation.z = angle;
    contacts.gripWheel(wheel,1);
    for (let i=0; i<hands.length; i++) {
      const pose = measure(hands[i]);
      assert.ok(Math.abs(Math.hypot(pose.palm.x,pose.palm.y)-wheel.userData.rimRadius) < 1e-6);
      assert.ok(Math.abs(pose.palm.z) < 1e-6);
      assert.ok(pose.palm.distanceTo(straight[i].palm) < 1e-6);
      assert.ok(pose.rotation.angleTo(straight[i].rotation) < 1e-6);
      assert.ok(pose.curl.angleTo(straight[i].curl) < 1e-6);
    }
  }
});
