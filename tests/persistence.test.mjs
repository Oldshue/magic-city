import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentStorage } from '../src/gameplay/persistence.mjs';

test('native persistence remains immediately visible and restoration supports asynchronous hosts', async () => {
  const values=new Map();
  const native=createPersistentStorage({storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},asynchronous:false});
  const saved=native.setItem('notebook','first');assert.equal(values.get('notebook'),'first');await saved;
  const host=createPersistentStorage({storage:{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)},asynchronous:true});
  assert.equal(await host.getItem('notebook'),'first');
});
test('rapid snapshots coalesce while unrelated keys persist independently without flooding the host', async () => {
  const calls=[],pending=[];
  const store=createPersistentStorage({asynchronous:true,storage:{getItem:async()=>null,setItem:(key,value)=>{calls.push({key,value});return new Promise(resolve=>pending.push(resolve));}}});
  const first=store.setItem('layout','initial');
  const middle=store.setItem('layout','middle');
  const latest=store.setItem('layout','final');
  const settings=store.setItem('settings','night');
  assert.equal(first,middle);assert.equal(first,latest);
  await new Promise(setImmediate);
  assert.deepEqual(calls,[{key:'layout',value:'initial'}]);
  pending.shift()();await new Promise(setImmediate);
  assert.deepEqual(calls[1],{key:'settings',value:'night'});
  pending.shift()();await new Promise(setImmediate);
  assert.deepEqual(calls[2],{key:'layout',value:'final'});
  pending.shift()();await Promise.all([latest,settings]);await store.flush();
});
test('failed host writes do not poison subsequent saves and unavailable storage stays usable', async () => {
  let attempts=0;
  const store=createPersistentStorage({asynchronous:true,storage:{getItem:async()=>null,setItem:async()=>{if(++attempts===1)throw Error('Unavailable');}}});
  await assert.rejects(store.setItem('draft','old'),/Unavailable/);
  await store.setItem('draft','new');assert.equal(attempts,2);
  const denied=createPersistentStorage({storage:null});assert.equal(await denied.getItem('draft'),null);await denied.setItem('draft','new');
});
