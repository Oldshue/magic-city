import test from 'node:test';
import assert from 'node:assert/strict';
import { readVehicleInput } from '../src/engine/vehicle-input.mjs';
test('touch stick supplies proportional throttle and steering without keyboard',()=>{
  assert.deepEqual(readVehicleInput({}, {x:.6,z:-.75}),{throttle:.75,steer:.6});
  assert.deepEqual(readVehicleInput({}, {x:-.4,z:.5}),{throttle:-.5,steer:-.4});
});
test('keyboard overrides active axes; opposing keys cancel without hidden stick motion',()=>{
  assert.deepEqual(readVehicleInput({KeyW:true,KeyA:true},{x:1,z:1}),{throttle:1,steer:-1});
  assert.deepEqual(readVehicleInput({ArrowUp:true,ArrowDown:true,KeyA:true,KeyD:true},{x:1,z:-1}),{throttle:0,steer:0});
});
test('invalid and oversized virtual axes do not escape the vehicle input range',()=>{
  assert.deepEqual(readVehicleInput({}, {x:NaN,z:Infinity}),{throttle:-0,steer:0});
  assert.deepEqual(readVehicleInput({}, {x:8,z:5}),{throttle:-1,steer:1});
});
