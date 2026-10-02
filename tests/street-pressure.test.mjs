import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetPressure, hasStreetSight } from '../src/gameplay/street-pressure.mjs';
const seen = {visible:true, driving:true, speed:16, nearestDistance:20};

test('patrols react to sustained witnessed driving, not unwitnessed speed or ordinary travel', () => {
  const law = createStreetPressure();
  law.update(20, {...seen, visible:false}); assert.equal(law.snapshot().heat, 0);
  law.update(20, {...seen, speed:8}); assert.equal(law.snapshot().heat, 0);
  law.update(1, seen); assert.equal(law.snapshot().heat, 0);
  law.update(.6, seen); assert.equal(law.snapshot().heat, 1);
  law.update(2.5, seen); assert.equal(law.snapshot().phase, 'pursuit');
});
test('a witnessed dangerous collision immediately escalates pursuit', () => {
  const law = createStreetPressure(); law.update(.05, {...seen, speed:0, crashed:true});
  assert.equal(law.snapshot().heat, 2);
  assert.match(law.snapshot().reason, /collision/);
});
test('breaking sight starts a search and renewed sight resets the escape clock', () => {
  const law = createStreetPressure(); law.update(2, seen);
  law.update(8, {visible:false, speed:0}); assert.equal(law.snapshot().phase, 'searching');
  assert.equal(law.snapshot().escapeRemaining, 4);
  law.update(.05, {...seen, driving:false, speed:0}); assert.equal(law.snapshot().escapeRemaining, 12);
  law.update(12, {visible:false, speed:0}); assert.equal(law.snapshot().heat, 0);
});
test('modal blockers freeze both escape and detention; stopping near a visible officer surrenders', () => {
  const law = createStreetPressure(); law.update(2, seen);
  law.update(30, {blocked:true, visible:false}); assert.equal(law.snapshot().escapeRemaining, 12);
  const stopped = {visible:true, driving:false, speed:0, nearestDistance:1};
  law.update(1, stopped); assert.equal(law.snapshot().captureProgress, .4);
  law.update(10, {...stopped, blocked:true}); assert.equal(law.snapshot().phase, 'watched');
  law.update(1.5, stopped); assert.equal(law.snapshot().phase, 'detained');
  law.update(20, {visible:false}); assert.equal(law.snapshot().phase, 'detained');
  law.release(); assert.equal(law.snapshot().heat, 0); assert.equal(law.snapshot().arrests, 1);
});
test('nearby moving players are not captured and snapshot mutation cannot rewrite pressure', () => {
  const law = createStreetPressure(); law.update(2, seen);
  law.update(10, {visible:true, speed:6, nearestDistance:1}); assert.equal(law.snapshot().captureProgress, 0);
  const output = {}; assert.equal(law.snapshot(output), output); output.heat = 0;
  assert.equal(law.snapshot().heat, 1);
});
test('movement colliders occlude street sight in either direction, including parallel rays', () => {
  const boxes = [{minX:2,maxX:4,minZ:-1,maxZ:1}];
  assert.equal(hasStreetSight(0,0,6,0,boxes), false);
  assert.equal(hasStreetSight(6,0,0,0,boxes), false);
  assert.equal(hasStreetSight(3,-4,3,4,boxes), false);
  assert.equal(hasStreetSight(0,2,6,2,boxes), true);
  assert.equal(hasStreetSight(0,0,1,0,boxes), true);
});

test('an explicit surrender requires active pressure and cannot duplicate detention', () => {
  const law=createStreetPressure();assert.equal(law.surrender(),false);
  law.update(2,seen);assert.equal(law.surrender(),true);
  assert.equal(law.snapshot().phase,'detained');assert.equal(law.surrender(),false);
  assert.equal(law.snapshot().arrests,1);
});
