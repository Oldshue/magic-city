import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { startPedestrians } from '../src/systems/pedestrians.js';
function build(characters) {
  const scene=new THREE.Scene();
  const crowd=startPedestrians({THREE,scene,plan:{streets:[]},getDayPhase:()=>.5,characters});
  crowd.update(0,0); return {scene,crowd};
}
test('stationary declarations extend the existing crowd without additional draw families',()=>{
  const baseline=build([]);
  const named=build([{id:'merchant',position:[-420,-138],paletteIdx:1},{id:'guard',position:[300,49],hatStyle:1}]);
  assert.equal(named.scene.children.length,baseline.scene.children.length);
  assert.ok(named.scene.children.every(mesh=>mesh.isInstancedMesh));
  const coat=named.scene.children[0],baseCoat=baseline.scene.children[0];
  assert.equal(coat.count,baseCoat.count+2);
  const matrix=new THREE.Matrix4();const position=new THREE.Vector3();
  coat.getMatrixAt(coat.count-2,matrix); position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x+420)<.01);assert.ok(Math.abs(position.z+138)<.01);
  named.crowd.update(.1,20);
  coat.getMatrixAt(coat.count-2,matrix);position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x+420)<.01);assert.ok(Math.abs(position.z+138)<.01,'Stationary character does not join a walking route');
});
test('malformed declarations cannot introduce invalid world transforms',()=>{
  const baseline=build([]),named=build([{position:[NaN,0]},{position:[1]},{position:null}]);
  assert.equal(named.scene.children[0].count,baseline.scene.children[0].count);
});
test('moving declarations reuse the crowd batches and retain a valid transform if their binding becomes malformed',()=>{
  const actor={id:'courier',position:[2,3],yawDeg:0,moving:false};
  const {scene,crowd}=build([actor]);const coat=scene.children[0];
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  actor.position[0]=17;actor.position[1]=-8;actor.yawDeg=90;actor.moving=true;
  crowd.update(.1,4);coat.getMatrixAt(coat.count-1,matrix);position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x-17)<.01);assert.ok(Math.abs(position.z+8)<.01);
  actor.position=[NaN,0];crowd.update(.1,5);coat.getMatrixAt(coat.count-1,matrix);
  assert.ok(matrix.elements.every(Number.isFinite));
});
