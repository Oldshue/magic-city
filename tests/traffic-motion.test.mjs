import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTraffic, blockerGap, HEAVIEST_CORNER_CROSSWALK, junctionGap, lanePosition, makeJunction, reserveJunction, speedBefore,
} from '../src/engine/traffic-motion.mjs';
import { HALF_LENGTH } from '../src/engine/vehicle-motion.mjs';

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


test('traffic yields before the painted crosswalk when a person approaches from the sidewalk', () => {
  const [twentieth,first] = roads();
  const crossing = HEAVIEST_CORNER_CROSSWALK;
  const junction = makeJunction(twentieth,first,crossing);
  const lead = {route:first,dist:72,dir:1};
  reserveJunction(junction,[lead],{x:-13.8,z:12.6,y:1.7});
  assert.equal(junction.owner,null);
  const halt = lead.dist+junctionGap(junction,lead);
  const outerEdge = crossing.offset+crossing.depth/2;
  assert.ok(first.junction.at-halt-HALF_LENGTH>outerEdge);

  reserveJunction(junction,[lead],{x:-23,z:18,y:1.7});
  assert.equal(junction.owner,lead);
  lead.dist=first.junction.at+outerEdge+.5;
  reserveJunction(junction,[lead]);
  assert.equal(junction.owner,lead);
  lead.dist=first.junction.at+outerEdge+HALF_LENGTH+.1;
  reserveJunction(junction,[lead]);
  assert.equal(junction.owner,null);
});


test('kiosk customers hold their crossing while perpendicular traffic can proceed', () => {
  const [twentieth,first] = roads();
  const junction = makeJunction(twentieth,first,HEAVIEST_CORNER_CROSSWALK);
  const approaching = {route:twentieth,dist:80.02,dir:1};
  const across = {route:first,dist:72,dir:1};
  junction.owner=approaching;
  reserveJunction(junction,[approaching,across],null,[{x:-12.9,z:-14.5,y:1.7}]);
  assert.equal(junction.owner,across);
  assert.equal(junction.crossingRequested,true);
  assert.ok(Number.isFinite(junctionGap(junction,approaching)));
  assert.equal(junctionGap(junction,across),Infinity);
});


test('a committed sedan clears a crosswalk only when a waiting walker is outside its lane', () => {
  const car = {x:-16.34, z:4.4, heading:Math.PI / 2};
  const walker = {x:-13.8, z:5.98, y:1.7};
  assert.equal(blockerGap(car, walker), 0);
  assert.equal(blockerGap(car, walker, true), Infinity);
  assert.equal(blockerGap(car, {...walker, z:5.9}, true), 0);
});
