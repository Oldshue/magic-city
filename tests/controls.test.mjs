import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from '../vendor/three.module.min.js';
import { createControls } from '../src/engine/controls.js';
test('named modal blockers suppress actual movement and pointer look without releasing vehicle camera ownership',()=>{
  const previous=globalThis.document;
  const documentEvents=new EventTarget(); globalThis.document=documentEvents;
  const canvas=new EventTarget(); canvas.getRootNode=()=>documentEvents;
  const camera=new PerspectiveCamera(); camera.position.set(0,1.7,0);
  const input=createControls(camera,canvas,{minX:-100,maxX:100,minZ:-100,maxZ:100});
  const emit=(type,props)=>documentEvents.dispatchEvent(Object.assign(new Event(type),props));
  try {
    input.controls.isLocked=true;
    input.setInputBlocked('journal',true); input.setInputBlocked('map',true);
    const orientation=camera.quaternion.toArray(),position=camera.position.toArray();
    emit('mousemove',{movementX:100,movementY:50}); emit('keydown',{code:'KeyW'});
    input.setVirtualMove(1,-1); input.update(.1);
    assert.deepEqual(camera.quaternion.toArray(),orientation); assert.deepEqual(camera.position.toArray(),position);
    assert.deepEqual(input.getVirtualMove(),{x:0,z:0});
    input.setInputBlocked('journal',false); assert.equal(input.controls.enabled,false);
    input.setEnabled(false); input.setInputBlocked('map',false); assert.equal(input.controls.enabled,false);
    input.setEnabled(true); assert.equal(input.controls.enabled,true);
    emit('mousemove',{movementX:100,movementY:0}); assert.notDeepEqual(camera.quaternion.toArray(),orientation);
    input.update(.1); assert.deepEqual(camera.position.toArray(),position, 'Keys pressed while blocked must not leak after close');
    emit('keydown',{code:'KeyW'}); input.update(.1); assert.notDeepEqual(camera.position.toArray(),position);
  } finally {input.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
