import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWaypoints } from '../src/narrative/mapMarkers.mjs';
const bounds={minX:-1200,maxX:1200,minZ:-1200,maxZ:1200};
test('map projection preserves north orientation and responsive relative coordinates',()=>{
  const points=projectWaypoints(bounds,[{id:'origin',position:[0,0],label:'Origin'},{id:'nw',position:[-1200,-1200]},{id:'se',position:[1200,1200]},{id:'station',position:[-420,-138],completed:true}]);
  assert.deepEqual(points.map(p=>[p.x,p.y]),[[.5,.5],[0,0],[1,1],[.325,.4425]]);
  assert.equal(points[3].completed,true);assert.equal(points[0].label,'Origin');
});
test('outside or malformed waypoints do not place misleading marks on the map',()=>{
  assert.deepEqual(projectWaypoints(bounds,[{position:[1201,0]},{position:[0,-1201]},{position:[NaN,0]},{position:[1,2,3]},{position:null}]),[]);
  assert.deepEqual(projectWaypoints({...bounds,maxX:-1200},[{position:[0,0]}]),[]);
});
