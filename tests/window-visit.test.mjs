import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowVisit } from '../src/systems/window-visit.mjs';

const dt = 1/60;
const clear = ()=>false;
const windowAt = (side,z,face=18)=>({point:{x:side*(face-1.36),y:.16,z},target:{x:side*(face+1.1),y:1.98,z}});

test('shoppers approach the actual display, stop off the lane, then pass the entrance near the curb',()=>{
  for (const [side,doorZ,displayZ] of [[1,20,22.59],[-1,32.5,35.89]]) {
    const laneX = side*13;
    const shop = windowAt(side,displayZ,side>0 ? 18 : 19);
    const visit = createWindowVisit(shop,laneX,1.08,3.42);
    const entry = displayZ + 4.55;
    assert.equal(visit.enter(entry-.12,entry+.05,clear),false);
    assert.equal(visit.enter(entry+.03,entry-.01,clear),true);
    const phases = new Set();
    const start = visit.pose.point.clone();
    let stoppedFor = 0;
    for (let i=0; i<1200 && visit.pose.phase; i++) {
      const {point,phase,speed,inspection} = visit.step(dt,clear);
      phases.add(phase);
      assert.ok(point.distanceTo(start)<.026,'one-step continuity');
      assert.ok(Math.abs(point.x)<=Math.abs(shop.point.x)+.20 && Math.abs(point.x)>=12.99);
      if (Math.abs(point.z-doorZ)<1.28) assert.ok(Math.abs(point.x)<14.75,'doorway apron stays clear');
      if (phase==='browsing') {
        assert.equal(speed,0);
        assert.ok(point.distanceToSquared(shop.point)<1e-9);
        assert.ok(inspection>=0 && inspection<1);
        stoppedFor+=dt;
      }
      start.copy(point);
    }
    assert.deepEqual([...phases],['approaching','browsing','rejoining',null]);
    assert.ok(Math.abs(stoppedFor-3.42)<.033);
    assert.ok(Math.abs(visit.pose.point.x-laneX)<.001);
    assert.ok(visit.pose.point.z<displayZ-2.24);
  }
});

test('an occupied window is skipped and a stopped shopper waits for the lane to clear',()=>{
  const visit = createWindowVisit(windowAt(1,22.59),13,1.08,2.5);
  assert.equal(visit.enter(28,26,()=>true),false);
  assert.equal(visit.pose.phase,null);
  assert.equal(visit.enter(28,26,clear),true);
  for (let i=0; i<500 && visit.pose.phase==='approaching'; i++) visit.step(dt,clear);
  assert.equal(visit.pose.phase,'browsing');
  visit.step(dt,()=>true);
  assert.equal(visit.pose.phase,'rejoining');
  const old = visit.pose.point.clone();
  for (let i=0; i<90; i++) visit.step(dt,()=>true);
  assert.equal(visit.pose.phase,'rejoining');
  assert.equal(visit.pose.point.distanceTo(old),0);
  for (let i=0; i<500 && visit.pose.phase; i++) visit.step(dt,clear);
  assert.equal(visit.pose.phase,null);
  assert.equal(visit.pose.point.x,13);
});
