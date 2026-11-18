import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from '../vendor/three.module.min.js';
import { createControls, PLAYER_RADIUS } from '../src/engine/controls.js';
import { hitsMovingObstacle, setCarBounds } from '../src/engine/vehicle-motion.mjs';
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

test('UI and touch gestures leave optional pointer capture available to a mouse', async()=>{
  const {JSDOM}=await import('jsdom');
  const dom=new JSDOM('<body><canvas></canvas><button><span>Close</span></button><div data-movement-control><span>Stick</span></div><div id="mc-narrative-root"><p>Paper</p></div></body>');
  const previousDocument=globalThis.document, previousMedia=globalThis.matchMedia;
  globalThis.document=dom.window.document;
  let requests=0;
  const body=document.body;
  body.requestPointerLock=()=>{requests++; return Promise.resolve();};
  const input=createControls(new PerspectiveCamera(),body,{minX:-100,maxX:100,minZ:-100,maxZ:100});
  const scene=document.querySelector('canvas');
  try {
    document.querySelector('button span').click();
    document.querySelector('[data-movement-control] span').click();
    document.querySelector('#mc-narrative-root p').click();
    const tap=new dom.window.MouseEvent('click',{bubbles:true});
    Object.defineProperty(tap,'pointerType',{value:'touch'});
    scene.dispatchEvent(tap);

    globalThis.matchMedia=query=>({matches:query==='(pointer: coarse)'});
    input.requestPointerLock();
    assert.equal(requests,0);

    globalThis.matchMedia=()=>({matches:false});
    scene.click();
    assert.equal(requests,1);
  } finally {
    input.dispose();
    dom.window.close();
    if(previousDocument===undefined) delete globalThis.document;
    else globalThis.document=previousDocument;
    if(previousMedia===undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia=previousMedia;
  }
});


test('holding forward rounds a solid sedan bumper at the west crosswalk', () => {
  const previous = globalThis.document;
  const events = new EventTarget();
  globalThis.document = events;
  const canvas = new EventTarget();
  canvas.getRootNode = () => events;
  const camera = new PerspectiveCamera();
  const input = createControls(camera, canvas, {minX:-100, maxX:100, minZ:-100, maxZ:100});
  const car = setCarBounds({}, -16.34, 4.4, Math.PI / 2, 'sedan');
  input.addMovingColliders([car]);
  try {
    input.setSpawn([-13.8, 5.94], 0);
    events.dispatchEvent(Object.assign(new Event('keydown'), {code:'KeyW'}));
    for (let frame = 0; frame < 16; frame++) {
      input.update(1/60);
      assert.equal(hitsMovingObstacle(car, camera.position.x, camera.position.z, PLAYER_RADIUS), false);
    }
    assert.ok(camera.position.x > -13.65);
    assert.ok(camera.position.z < 4.9, 'forward movement can go around the nose');

    input.setSpawn([-15.4, 6.05], 0);
    for (let frame = 0; frame < 16; frame++) input.update(1/60);
    assert.ok(Math.abs(camera.position.x + 15.4) < 1e-6);
    assert.ok(camera.position.z >= 5.97, 'the broad side remains solid');
  } finally {
    input.dispose();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('a long sprint step cannot jump across a closed moving leaf', () => {
  const previous = globalThis.document;
  const events = new EventTarget();
  globalThis.document = events;
  const canvas = new EventTarget();
  canvas.getRootNode = () => events;
  const camera = new PerspectiveCamera();
  const input = createControls(camera,canvas,{minX:-100,maxX:100,minZ:-100,maxZ:100});
  const owner = {configuration:{halfWidth:.035,halfLength:.705}};
  const leaf = setCarBounds({},0,0,Math.PI/2,owner);
  input.addMovingColliders([leaf]);
  try {
    input.setSpawn([0,.52],0);
    for (const code of ['KeyW','ShiftLeft']) {
      events.dispatchEvent(Object.assign(new Event('keydown'),{code}));
    }
    input.update(.1);
    assert.ok(camera.position.z>=PLAYER_RADIUS);
    setCarBounds(leaf,-.72,-.705,0,owner);
    input.update(.1);
    assert.ok(camera.position.z<-.9);
  } finally {
    input.dispose();
    if (previous===undefined) delete globalThis.document;
    else globalThis.document=previous;
  }
});
