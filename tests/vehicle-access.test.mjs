import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Group, Quaternion, Vector3 } from '../vendor/three.module.min.js';
import { constrainLimb } from '../src/engine/limb-constraint.js';
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
