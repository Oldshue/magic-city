import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWiperMotion, WIPE_SAMPLES } from '../src/engine/windshield-motion.mjs';

const profile = {park:-1.46, far:.51, strokeSeconds:1};

test('the blade clears continuous sectors only as it passes over them', () => {
  const wiper = createWiperMotion(profile);
  assert.equal(wiper.angle,profile.park);
  assert.ok(wiper.freshness.every(value=>value === 0));

  assert.equal(wiper.update(.5,1,true),false);
  assert.ok(Math.abs(wiper.angle - (profile.park + profile.far) * .5) < 1e-8);
  assert.ok(wiper.freshness.slice(0, WIPE_SAMPLES / 2).every(value=>value > .99));
  assert.equal(wiper.freshness.at(-1),0);

  assert.equal(wiper.update(.5,1,true),true);
  assert.equal(wiper.angle,profile.far);
  assert.ok(wiper.freshness.every(value=>value > .7));
});

test('switching off finishes the stroke, parks and gives the rain time to return', () => {
  const wiper = createWiperMotion(profile);
  wiper.update(.55,1,true);
  const atSwitchOff = wiper.angle;
  wiper.update(.2,1,false);
  assert.ok(wiper.angle > atSwitchOff);
  wiper.update(1,1,false);
  assert.ok(wiper.angle < atSwitchOff && wiper.angle > profile.park);
  wiper.update(.25,1,false);
  assert.equal(wiper.angle,profile.park);

  const nearPark = wiper.freshness[0];
  wiper.update(5,1,false);
  assert.equal(wiper.angle,profile.park);
  assert.ok(wiper.freshness.every(value=>value < nearPark * .06));
});
