import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approachesDoor, createEntranceMotion, ENTRANCE_SWING, hitsDoorLeaf, occupiesDoorway } from '../src/engine/shop-entrance-motion.mjs';

test('each direction can request a passage and sidewalk traffic stays outside the request', () => {
  assert.ok(approachesDoor(.705,1.2,-.1,1.41));
  assert.ok(approachesDoor(.705,-1.2,.1,1.41));
  assert.equal(approachesDoor(.705,1.2,0,1.41),false);
  assert.equal(approachesDoor(.705,1.2,.1,1.41),false);
  assert.equal(approachesDoor(2.2,1.2,-.1,1.41),false);
  assert.equal(approachesDoor(.705,2.4,-.1,1.41),false);
});

test('opening rings once and a body in the swing can hold the door before it latches', () => {
  const door=createEntranceMotion();
  const events=[];
  const step=(n,ask,body)=>{for(let i=0;i<n;i++) events.push(door.update(.025,ask,body));};
  step(21,true,false);
  assert.equal(door.angle,ENTRANCE_SWING);
  assert.equal(events.filter(e=>e==='ring').length,1);
  step(84,false,true);
  assert.equal(door.angle,ENTRANCE_SWING);
  step(26,false,false);
  assert.ok(door.angle < ENTRANCE_SWING && door.angle > 0);
  step(21,true,false);
  assert.equal(events.filter(e=>e==='ring').length,1);
  step(76,false,false);
  assert.equal(door.angle,0);
  assert.equal(events.filter(e=>e==='latch').length,1);
  step(9,true,false);
  assert.equal(events.filter(e=>e==='ring').length,2);
});

test('the closed leaf blocks the threshold and the open leaf stays against the jamb', () => {
  assert.ok(hitsDoorLeaf(.705,.17,.28,1.41,0));
  assert.equal(hitsDoorLeaf(.705,.17,.28,1.41,ENTRANCE_SWING),false);
  assert.ok(hitsDoorLeaf(.05,-.86,.28,1.41,ENTRANCE_SWING));
  assert.ok(occupiesDoorway(.705,-.79,.33,1.41));
  assert.equal(occupiesDoorway(.705,-1.73,.33,1.41),false);
});
