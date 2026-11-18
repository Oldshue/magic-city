import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from '../vendor/three.module.min.js';
import { createRainShelter, underStoreCover } from '../src/systems/rain-shelter.mjs';

const roof = {
  side:1, wallX:18, z:32, halfWidth:3.88, start:.18, projection:2.30,
  wallY:3.41, eaveY:2.96, roomY:4.35, roomHalfWidth:5.2, roomDepth:4.72,
  bays:[new Vector3(16.7,.16,34.57),new Vector3(16.7,.16,29.48)],
};
const clear = () => false;

test('the sloped awning covers its sidewalk bays and the storefront roof covers the room', () => {
  assert.equal(underStoreCover([roof],16.7,1.8,34.57),true);
  assert.equal(underStoreCover([roof],16.1,3.08,32),false);
  assert.equal(underStoreCover([roof],16.1,2.78,32),true);
  assert.equal(underStoreCover([roof],15.4,1.8,32),false);
  assert.equal(underStoreCover([roof],16.9,1.8,36.2),false);
  assert.equal(underStoreCover([roof],19,2.0,32),true);
  assert.equal(underStoreCover([roof],19,4.5,32),false);
  assert.equal(underStoreCover([roof],23.3,1.8,32),false);
});

test('a shopper approaches, stays dry through continuing rain, and walks back to the same sidewalk', () => {
  const route = createRainShelter(roof,13,1.1);
  assert.ok(route.enter(13,41,Math.PI,1.1,clear));
  const initial=route.pose.point.clone();
  let peakSpeed=0;
  for (let i=0; route.pose.phase==='seeking shelter' && i<900; i++) {
    const previous=route.pose.point.clone();
    route.step(.016,.94,clear);
    peakSpeed=Math.max(peakSpeed,route.pose.speed);
    assert.ok(route.pose.point.distanceTo(previous)<.028,'position advances continuously');
    assert.ok(route.pose.point.x>=13 && route.pose.point.x<18,'route stays off the road and outside the glass');
  }
  assert.ok(peakSpeed>1.3);
  assert.equal(route.pose.phase,'under the awning');
  assert.ok(route.pose.point.distanceTo(roof.bays[0])<1e-7);
  assert.ok(route.pose.point.distanceTo(initial)>7);
  for (let i=0;i<360;i++) route.step(.016,.97,clear);
  assert.equal(route.pose.phase,'under the awning');
  assert.equal(route.pose.speed,0);
  assert.ok(Math.abs(route.pose.heading+Math.PI/2)<.02 || Math.abs(route.pose.heading-1.5*Math.PI)<.02);
  for (let i=0; route.pose.phase && i<900; i++) route.step(.016,.25,clear);
  assert.equal(route.pose.phase,null);
  assert.ok(Math.abs(route.pose.point.x-13)<1e-8);
  assert.ok(route.pose.point.z<roof.bays[0].z-2);
});

test('an occupied bay is skipped and an obstruction stops the approach on the sidewalk', () => {
  const route = createRainShelter(roof,13,1.1);
  assert.equal(route.enter(13,40,Math.PI,1.1,()=>true),false);
  assert.ok(route.enter(13,40,Math.PI,1.1,(x,z)=>Math.abs(z-34.57)<.1));
  for (let i=0;i<90;i++) route.step(.016,.9,()=>true);
  assert.equal(route.pose.phase,'seeking shelter');
  assert.ok(Math.hypot(route.pose.point.x-13,route.pose.point.z-40)<.24);
  assert.equal(route.pose.speed,0);
  for (let i=0;route.pose.phase==='seeking shelter' && i<1200;i++) route.step(.016,.93,clear);
  assert.equal(route.pose.phase,'under the awning');
  assert.ok(route.pose.point.distanceTo(roof.bays[1])<1e-7);
});
