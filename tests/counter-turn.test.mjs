import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import * as THREE from '../vendor/three.module.min.js';
import { startCrownPatrons } from '../src/systems/crown-patrons.js';

test('Ada finishes one patron’s cup before the player can order and keeps the player’s pickup on the counter', async () => {
  const dom=new JSDOM('<main></main>',{url:'https://magic-city.test/'});
  const keys=['window','document','CustomEvent','localStorage'];
  const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  for (const key of keys) {
    Object.defineProperty(globalThis,key,{configurable:true,value:key==='window' ? dom.window : dom.window[key]});
  }
  try {
    const {initCounterService}=await import('../src/narrative/counter-service.mjs');
    const shop=new THREE.Group();
    const stream=new THREE.Object3D();
    function drink(x) {
      const group=new THREE.Group(), filled=new THREE.Object3D();
      group.add(filled);
      group.visible=false;
      shop.add(group);
      return {group,filled,stream,stock:[-.37,1.058,-2.8],edge:[x,1.058,-2.155],spout:[-.333,1.355,-2.6]};
    }
    const player=drink(-.18), first=drink(-.55), second=drink(-.55);
    const counter={kind:'lunch',name:'Crown Lunch Counter',shop,actor:{position:[0,-3.2]},service:player};
    const camera=new THREE.PerspectiveCamera(70,1,.1,100);
    camera.position.set(0,1.7,-1.45);
    let interaction;
    const ctx={THREE,camera,shopCounters:[counter],wardrobe:{},
      interactions:{register(provide){interaction=provide;},block(){}},
      controls:{setInputBlocked(){},controls:{unlock(){}}}};
    const service=await initCounterService(ctx,document.querySelector('main'));
    const button=label=>Array.from(document.querySelectorAll('#mc-counter-choices button'))
      .find(el=>el.textContent===label);

    assert.equal(service.servePatron(counter,first),true);
    assert.equal(service.servePatron(counter,second),false);
    interaction().activate();
    assert.equal(button('Order coffee · 15¢').disabled,true);
    assert.match(document.querySelector('#mc-counter-line').textContent,/hand this coffee over/);
    assert.equal(service.finishPatron(counter,first),false);
    service.update(2.4);
    assert.equal(service.patronReady(counter,first),true);
    assert.equal(service.finishPatron(counter,second),false);
    assert.equal(service.finishPatron(counter,first),true);
    assert.equal(button('Order coffee · 15¢').disabled,false);
    assert.equal(service.servePatron(counter,second),false);

    button('Order coffee · 15¢').click();
    service.update(2.4);
    assert.equal(player.group.visible,true);
    assert.equal(button('Take coffee · 15¢').disabled,false);
    assert.match(document.querySelector('#mc-counter-cash').textContent,/\$1.00/);
    button('Leave the counter').click();

    assert.equal(service.servePatron(counter,second),true);
    service.update(.91);
    assert.equal(counter.actor.carries,second.group);
    interaction().activate();
    assert.equal(player.group.visible,false);
    assert.equal(counter.actor.carries,second.group);
    assert.equal(second.group.visible,true);
    assert.match(document.querySelector('#mc-counter-receipt').textContent,/85¢ left/);
    assert.equal(JSON.parse(dom.window.localStorage.getItem('magic-city:counter-purchases')).sales.lunch,1);
  } finally {
    for (let i=0;i<keys.length;i++) {
      if (previous[i]===undefined) delete globalThis[keys[i]];
      else Object.defineProperty(globalThis,keys[i],previous[i]);
    }
    dom.window.close();
  }
});

test('both Crown regulars can take a seat and rejoin the line on a later visit', () => {
  const shop=new THREE.Group();
  const booths=[
    {seat:[-3,.590,-2.46],aisle:[-2.27,0,-2.12],yaw:0,cup:[-3,.966,-1.76]},
    {seat:[3,.590,-1.06],aisle:[2.27,0,-1.40],yaw:Math.PI,cup:[3,.966,-1.76]},
  ];
  let active=null, time=0, ready=0;
  const visits=new Map();
  const cafe={
    kind:'lunch',shop,service:{booths,patronCup(name){
      return {group:new THREE.Group(),filled:new THREE.Object3D(),edge:[-.55,1.058,-2.155],name};
    }},
  };
  const ctx={
    shopCounters:[cafe],characters:[],camera:{position:new THREE.Vector3(40,1.7,40)},
    controls:{addMovingColliders(){}},
    counterService:{
      canServePatron:()=>!active,
      servePatron(counter,drink) {
        if (active) return false;
        ready=time+2.26;
        active=drink;
        visits.set(drink.name,(visits.get(drink.name)??0)+1);
        return true;
      },
      patronReady:(_,drink)=>active===drink && time>ready,
      finishPatron(_,drink) {
        if (active!==drink || time<=ready) return false;
        active=null;
        return true;
      },
    },
  };
  const queue=startCrownPatrons(ctx);
  const servings=new Map(ctx.characters.map(actor=>[actor.id,new Set()]));
  for (let step=0;step<8700;step++) {
    time+=1/60;
    queue.update(1/60);
    for (const actor of ctx.characters) {
      const [x,z]=actor.position;
      assert.ok(Number.isFinite(x+z));
      if (Math.abs(z)<.2) assert.ok(Math.abs(x)<.42,'pass through the doorway');
      if (actor.dining.seat===1 && actor.dining.amount>.95 && actor.dining.mode==='at the table') {
        servings.get(actor.id).add(visits.get(actor.id+' coffee'));
      }
    }
  }
  for (const actor of ctx.characters) {
    assert.ok(servings.get(actor.id).has(1));
    assert.ok(servings.get(actor.id).has(2));
  }
});
