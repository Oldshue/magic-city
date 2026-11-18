import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrossingAttention, crossingVehicleScore, updateCrossingAttention } from '../src/engine/crossing-attention.mjs';

const north = { axis:'x', x:0, z:-14.5, halfSpan:11, depth:3.4 };
const walker = { x:-10.3, z:-13.9, vx:1.32, active:true, committed:true };
const sedan = { x:-9.3, z:-7.5, heading:Math.PI, speed:5 };

test('a walker watches the sedan entering their crossing, including a reversing car', () => {
  const score = crossingVehicleScore(north,walker,sedan);
  assert.ok(Number.isFinite(score));
  assert.ok(crossingVehicleScore(north,walker,{...sedan,speed:8}) < score);
  assert.equal(crossingVehicleScore(north,walker,{...sedan,heading:Math.PI/2}),Infinity);
  assert.equal(crossingVehicleScore(north,walker,{...sedan,z:-25}),Infinity);
  assert.equal(crossingVehicleScore(north,walker,{...sedan,x:14}),Infinity);
  assert.equal(crossingVehicleScore(north,walker,{...sedan,x:-8,z:-4,speed:0}),Infinity);
  assert.equal(crossingVehicleScore(north,{...walker,x:-6},sedan),Infinity);
  assert.ok(Number.isFinite(crossingVehicleScore(north,walker,{...sedan,heading:0,speed:-4})));
});

test('a pedestrian turns toward traffic, nods once to a yielding driver, then relaxes', () => {
  const attention = createCrossingAttention();
  const stopped = {...sedan,z:-10.77,speed:0,yielding:true};
  const step = (frames, person, car) => {
    for (let i=0;i<frames;i++) updateCrossingAttention(attention,person,Math.PI/2,car,1/60);
  };
  step(20,walker,sedan);
  assert.equal(attention.mode,'watching');
  assert.ok(attention.yaw<-.87);
  step(20,{...walker,committed:false},stopped);
  assert.equal(attention.mode,'watching');
  assert.equal(attention.acknowledged,false);
  step(22,walker,stopped);
  assert.equal(attention.mode,'nodding');
  assert.ok(attention.pitch>.24);
  step(66,walker,stopped);
  assert.equal(attention.mode,'watching');
  assert.ok(attention.pitch<.13);
  step(60,{...walker,active:false},null);
  assert.equal(attention.mode,'');
  assert.ok(Math.abs(attention.yaw)<.003);
  step(20,walker,stopped);
  assert.equal(attention.mode,'nodding');
});

test('a curbside scan checks both directions and settles when the walker steps', () => {
  const attention = createCrossingAttention();
  for (let i=0;i<73;i++) {
    updateCrossingAttention(attention,{...walker,committed:false},Math.PI/2,null,1/60);
    if (i===24) assert.ok(attention.yaw>.61);
  }
  assert.ok(attention.yaw<-.51);
  assert.equal(attention.mode,'checking');
  for (let i=0;i<40;i++) updateCrossingAttention(attention,walker,Math.PI/2,null,1/60);
  assert.equal(attention.mode,'');
  assert.ok(Math.abs(attention.yaw)<.004);
});
