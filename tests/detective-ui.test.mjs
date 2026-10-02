import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as THREE from '../vendor/three.module.min.js';
import { createControls } from '../src/engine/controls.js';
import { createInteractions } from '../src/engine/interactions.mjs';
import { initDetective } from '../src/narrative/detective.mjs';

function harness(saved = null, storageDenied = false) {
  const dom=new JSDOM('<!doctype html><html><head></head><body><main></main><canvas></canvas></body></html>',{url:'https://game.test/',pretendToBeVisual:true});
  const faults=[];dom.window.addEventListener('error',event=>faults.push(event.error?.message||event.message));
  const originals=new Map();
  for(const name of ['document','CustomEvent','localStorage','requestAnimationFrame']){
    originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='requestAnimationFrame'?dom.window.requestAnimationFrame.bind(dom.window):dom.window[name]});
  }
  if(storageDenied)globalThis.localStorage={getItem(){throw new Error('Storage denied');},setItem(){throw new Error('Storage denied');}};
  if(saved)localStorage.setItem('magic-city:case:last-train',JSON.stringify(saved));
  const root=document.querySelector('main'),camera=new THREE.PerspectiveCamera();
  const controls=createControls(camera,document.querySelector('canvas'),{minX:-1200,maxX:1200,minZ:-1200,maxZ:1200});
  const ctx={THREE,camera,controls,scene:new THREE.Scene(),characters:[],interactions:createInteractions(),materials:{bronze:new THREE.MeshStandardMaterial(),limestone:new THREE.MeshStandardMaterial()},deco:{canvasSign:()=>new THREE.Group()}};
  const state=initDetective(ctx,root);
  const dialog=document.querySelector('#mc-case-dialog');
  function click(text){const button=[...dialog.querySelectorAll('button')].find(el=>el.textContent===text);assert.ok(button,`Missing choice: ${text}`);assert.equal(button.disabled,false);button.click();}
  function move(x,z){controls.setSpawn([x,z],0);}
  return{ctx,state,root,dialog,click,move,play:()=>root.dispatchEvent(new CustomEvent('magic-city:play')),close:()=>click('Return to the streets · Escape'),dispose(){controls.dispose();dom.window.close();for(const[name,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}assert.deepEqual(faults,[],'No uncaught UI event errors');}};
}

test('real case UI gates choices, records evidence, blocks movement and composes a proven verdict',()=>{
  const h=harness();
  try{
    assert.equal(h.ctx.characters.length,2);h.play();assert.equal(h.dialog.hidden,false);assert.equal(h.ctx.controls.isInputBlocked(),true);
    h.click('Take the case · begin at Terminal Station');assert.equal(h.ctx.controls.isInputBlocked(),false);
    h.move(-454,-138);assert.equal(h.ctx.interactions.activate(),true);
    assert.equal([...h.dialog.querySelectorAll('button')].find(el=>el.textContent==='Show the altered freight docket.').disabled,true);
    h.click('Ask about the missing clerk.');h.close();
    h.move(-420,-138);h.ctx.interactions.activate();assert.match(h.dialog.textContent,/coal car is listed twice/);h.close();
    assert.ok(JSON.parse(localStorage.getItem('magic-city:case:last-train')).evidence.includes('docket'));
    h.move(-454,-138);h.ctx.interactions.activate();h.click('Show the altered freight docket.');h.close();
    h.move(-320,-88);h.ctx.interactions.activate();h.close();
    h.move(300,49);h.ctx.interactions.activate();h.click('Ask what she heard after her set.');h.click('Show her the hotel carbon copy.');h.close();
    h.move(150,-672);h.ctx.interactions.activate();h.close();
    h.move(-390,-138);h.ctx.interactions.activate();h.click('Accuse Edgar Vale · freight dispatcher');h.click('Make the accusation');
    assert.equal(h.state.snapshot().outcome.verdict,'proved');assert.match(h.dialog.textContent,/clerk comes home alive/);
    h.click('Reopen the case');assert.deepEqual(h.state.snapshot(),{evidence:[],testimony:[],outcome:null});
  }finally{h.dispose();}
});
test('saved progress resumes through the actual introduction and journal',()=>{
  const h=harness({version:1,caseId:'last-train',evidence:['docket'],testimony:[],suspectId:null});
  try{
    h.play();assert.match(h.dialog.textContent,/previous investigation/);
    h.click('Continue the case · return to Terminal Station');
    document.querySelector('#mc-journal-button').click();
    assert.match(h.dialog.textContent,/✓ A torn freight docket/);assert.equal(document.querySelector('#mc-case-portrait').hidden,false);
  }finally{h.dispose();}
});

test('actual UI remains playable when browser storage is denied',()=>{
  const h=harness(null,true);
  try{
    h.play();h.click('Take the case · begin at Terminal Station');
    h.move(-420,-138);h.ctx.interactions.activate();h.close();
    document.querySelector('#mc-journal-button').click();
    assert.match(h.dialog.textContent,/✓ A torn freight docket/);
    assert.ok(h.state.snapshot().evidence.includes('docket'));
  }finally{h.dispose();}
});
