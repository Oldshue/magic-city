import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF_LENGTH } from '../src/engine/vehicle-motion.mjs';
import {
  crossingBodyBlocked, pedestrianBrakeRoom, pedestrianTravelFraction, speedAtPedestrian,
} from '../src/engine/pedestrian-clearance.mjs';

test('only a pedestrian in or stepping into the Packard’s path reduces the allowable speed',()=>{
  const ahead={x:0,z:8,committed:true};
  const side={x:3.2,z:8,committed:true,vx:1.1};
  const entering={...side,vx:-1.25};
  const curb={...ahead,committed:false};
  assert.equal(pedestrianBrakeRoom([side,curb],0,0,0,1,14),Infinity);
  const room=pedestrianBrakeRoom([ahead],0,0,0,1,14);
  assert.ok(Math.abs(room-(8-HALF_LENGTH-.85))<.0001);
  assert.equal(pedestrianBrakeRoom([entering],0,0,0,1,14),room);
  assert.equal(pedestrianBrakeRoom([ahead],0,0,0,-1,4),Infinity);
  assert.ok(speedAtPedestrian(14,14.1,room,.025)<14);
  assert.equal(speedAtPedestrian(0,.21,0,.025),0);
  assert.equal(speedAtPedestrian(-4,-4.1,Infinity,.025),-4.1);
});

test('sweeping the footprint prevents pass-through and permits moving away from contact',()=>{
  const walker={x:0,z:5,committed:true};
  const straight=pedestrianTravelFraction([walker],0,0,0,0,12);
  assert.ok(straight>0&&straight<.25);
  assert.equal(crossingBodyBlocked([walker],0,12*straight,0),false);
  assert.equal(pedestrianTravelFraction([walker],0,0,0,0,-10),1);
  assert.equal(pedestrianTravelFraction([{...walker,x:3}],0,0,0,0,12),1);
  assert.ok(pedestrianTravelFraction([{...walker,x:5,z:0}],0,0,0,12,0)<1);
  assert.ok(pedestrianTravelFraction([{...walker,z:-5}],0,0,0,0,-12)<1);
  assert.equal(pedestrianTravelFraction([{...walker,z:2.45}],0,0,0,0,-.18),1);
  assert.equal(pedestrianTravelFraction([{...walker,z:2.45}],0,0,0,0,.18),0);
});
