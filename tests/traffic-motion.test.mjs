import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTraffic, blockerGap, junctionGap, lanePosition, makeJunction, reserveJunction, speedBefore,
} from '../src/engine/traffic-motion.mjs';

test('opposite directions occupy opposite sides of a two-way street', () => {
  const north = lanePosition(0,30,Math.PI,4.84);
  const south = lanePosition(0,30,0,4.84);
  assert.ok(Math.abs(north[0]-4.84)<1e-6 && Math.abs(north[1]-30)<1e-6);
  assert.deepEqual(south,[-4.84,30]);
});

test('traffic brakes for a person ahead and ignores people on the sidewalk', () => {
  const car = {x:4.84,z:30,heading:Math.PI};
  const pedestrian = {x:4.84,z:21.5,y:1.7};
  assert.ok(Math.abs(blockerGap(car,pedestrian)-4.8)<1e-6);
  assert.equal(blockerGap(car,{...pedestrian,x:11.8}),Infinity);
  assert.equal(blockerGap(car,{...pedestrian,z:32}),Infinity);
  const [stopped, advance] = advanceTraffic(8,speedBefore(.07),.07,.04);
  assert.equal(stopped,0);
  assert.equal(advance,.07);
  assert.ok(advanceTraffic(0,8,Infinity,.25)[0]>0);
});

function roads() {
  return [
    {pts:[{x:0,z:-100},{x:0,z:100}],segLens:[200],width:22},
    {pts:[{x:-100,z:0},{x:100,z:0}],segLens:[200],width:20},
  ];
}

test('the lead car clears the intersection before perpendicular traffic enters', () => {
  const [twentieth,first] = roads();
  const junction = makeJunction(twentieth,first);
  const lead = {route:twentieth,dist:83,dir:1};
  const second = {route:first,dist:79,dir:1};
  reserveJunction(junction,[second,lead]);
  assert.equal(junction.owner,lead);
  assert.equal(junctionGap(junction,lead),Infinity);
  assert.ok(junctionGap(junction,second)<7);
  lead.dist = 106;
  reserveJunction(junction,[second,lead]);
  assert.equal(junction.owner,lead);
  lead.dist = 114;
  reserveJunction(junction,[second,lead]);
  assert.equal(junction.owner,second);
  assert.equal(junctionGap(junction,second),Infinity);
});

test('the junction keeps new vehicles outside while a pedestrian is in the crossing', () => {
  const [twentieth,first] = roads();
  const junction = makeJunction(twentieth,first);
  const approach = {route:twentieth,dist:86.15,dir:1};
  reserveJunction(junction,[approach],{x:2,z:0,y:1.7});
  assert.equal(junction.owner,null);
  assert.ok(junctionGap(junction,approach)<.01);
  reserveJunction(junction,[approach],{x:16,z:15,y:1.7});
  assert.equal(junction.owner,approach);
  assert.equal(junctionGap(junction,approach),Infinity);
});
