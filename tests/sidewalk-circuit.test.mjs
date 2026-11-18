import test from 'node:test';
import assert from 'node:assert/strict';
import { cornerCrosswalks } from '../src/engine/traffic-motion.mjs';
import { getStreetSegments, inRoad } from '../src/engine/street-layout.js';
import { createSidewalkWalker, sidewalkCircuit } from '../src/systems/sidewalk-circuit.mjs';

const crossings=cornerCrosswalks(0,0,22,20);
const roads=getStreetSegments([
  {name:'20th',width:22,path:[[0,-100],[0,100]]},
  {name:'First',width:20,path:[[-100,0],[100,0]]},
  {name:'Morris',width:11,path:[[-100,58],[100,58]]},
]);

test('closed circuits join four actual crosswalks with continuous turns and clear shop approaches',()=>{
  for (const side of [-1,1]) {
    const {legs}=sidewalkCircuit(crossings,side);
    const marked=legs.filter(leg=>leg.crosswalk).map(leg=>leg.crosswalk);
    assert.deepEqual(marked,[side>0?'east':'west','north',side>0?'west':'east','south']);
    for (const [index,leg] of legs.entries()) {
      const next=legs[(index+1)%legs.length];
      assert.ok(leg.curve.getPoint(1).distanceTo(next.curve.getPoint(0))<.0001);
      assert.ok(leg.curve.getTangent(1).dot(next.curve.getTangent(0))>.999);
      for (let i=0;i<=100;i++) {
        const p=leg.curve.getPoint(i/100);
        if (inRoad(p.x,p.z,roads)) {
          const crossing=crossings.find(crossing=>crossing.id===leg.crosswalk);
          assert.ok(crossing,JSON.stringify({x:p.x,z:p.z}));
          const {minX,maxX,minZ,maxZ}=crossing.road;
          assert.ok(p.x>=minX-.01&&p.x<=maxX+.01&&p.z>=minZ-.01&&p.z<=maxZ+.01);
        }
        if (Math.abs(p.z-20)<1.28) assert.ok(p.x<15.65);
        if (Math.abs(p.z-32.5)<1.28) assert.ok(p.x>-15.65);
      }
    }
  }
});

test('a walker waits on pavement, completes a granted crossing, and releases once clear',()=>{
  const east=crossings.find(crossing=>crossing.id==='east');
  const walker=createSidewalkWalker(sidewalkCircuit(crossings,1),1.18,{before:east.id});
  let clear=false;
  const permits=[];
  const traffic={canCross(person){permits.push(person.crosswalk);return clear;}};
  const dt=1/60;
  for (let frame=0;frame<180 && !walker.request.active;frame++) walker.step(dt,traffic);
  assert.ok(walker.request.active);
  const curb=walker.pose.point.clone();
  for (let frame=0;frame<30;frame++) walker.step(dt,traffic);
  assert.equal(walker.pose.activity,'waiting to cross');
  assert.equal(walker.pose.point.distanceTo(curb),0);
  assert.ok(curb.z>east.halfSpan);
  assert.deepEqual([...new Set(permits)],[east.id]);
  clear=true;
  walker.step(dt,traffic);
  clear=false;
  const checked=permits.length;
  for (let frame=0;frame<1600 && walker.request.active;frame++) walker.step(dt,traffic);
  assert.equal(walker.request.active,false);
  assert.equal(permits.length,checked);
  assert.ok(walker.pose.point.z<-east.halfSpan);
});

test('a crossing pedestrian keeps the reservation and continues after a car clears its path',()=>{
  const walker=createSidewalkWalker(sidewalkCircuit(crossings,1),1.18,{before:'east'});
  let blocked=false;
  const traffic={canCross(){return true;},canStepInCrossing(){return !blocked;}};
  const dt=1/60;
  for (let frame=0;frame<240 && !walker.request.committed;frame++)walker.step(dt,traffic);
  assert.ok(walker.request.committed);
  const before=walker.pose.point.clone();
  blocked=true;
  for (let frame=0;frame<60;frame++)walker.step(dt,traffic);
  assert.equal(walker.pose.point.distanceTo(before),0);
  assert.ok(walker.request.active);
  blocked=false;
  for (let frame=0;frame<180;frame++)walker.step(dt,traffic);
  assert.ok(walker.pose.point.distanceTo(before)>2.5);
});
