import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseState } from '../src/gameplay/case-state.mjs';
import { RAILWAY_CASE } from '../src/gameplay/railway-case.mjs';
import { createInteractions } from '../src/engine/interactions.mjs';
function opened() { const s = createCaseState(RAILWAY_CASE); s.collect('docket'); s.say('porter','ask'); s.say('singer','ask'); return s; }
test('clue and dialogue dependencies reject premature access', () => {
  const s=createCaseState(RAILWAY_CASE);
  assert.equal(s.collect('ledger'),false); assert.equal(s.say('porter','show'),null); assert.equal(s.conclude('vale'),null);
  assert.equal(s.collect('unknown'),false); s.say('porter','ask'); assert.equal(s.collect('ledger'),true); assert.equal(s.collect('ledger'),false);
});
test('correct accusation needs physical proof and independent identification', () => {
  const s=opened(); assert.equal(s.conclude('vale').verdict,'unproven');
  s.reset(); s.collect('docket'); s.say('porter','ask'); s.say('porter','show'); s.collect('ledger'); s.say('singer','ask'); s.say('singer','show'); s.collect('order');
  assert.equal(s.conclude('vale').verdict,'proved'); assert.equal(s.conclude('bell'),null); assert.equal(s.say('porter','ask'),null);
});
test('wrong suspect gives distinct consequence; replay clears all progress', () => {
  const s=opened(); assert.equal(s.conclude('bell').verdict,'wrong'); s.reset(); assert.deepEqual(s.snapshot(),{evidence:[],testimony:[],outcome:null});
  assert.equal(s.collect('order'),false); assert.equal(s.collect('docket'),true);
});
test('unrelated scenario reuses state without railway-specific logic', () => {
  const s=createCaseState({clues:[{id:'receipt'}],witnesses:[{id:'cashier',choices:[{id:'verify',grants:'confirmed',response:'Confirmed.'}]}],suspects:[{id:'buyer',correct:true,proved:'Recovered',failed:'Unproven'}],accusationRequires:['receipt'],proofRequires:['confirmed']});
  s.collect('receipt'); s.say('cashier','verify'); assert.equal(s.conclude('buyer').verdict,'proved');
});
test('one interaction wins: nearest at same priority, vehicle exit outranks nearby clue', () => {
  const i=createInteractions(); const calls=[];
  i.register(()=>({distance:2,label:'clue',activate:()=>calls.push('clue')}));
  const remove=i.register(()=>({distance:1,label:'car',activate:()=>calls.push('car')}));
  i.activate(); remove(); i.register(()=>({distance:8,priority:100,label:'exit',activate:()=>calls.push('exit')}));
  i.activate(); i.block('journal',true); assert.equal(i.activate(),false); i.block('dialogue',true); i.block('journal',false); assert.equal(i.activate(),false); i.block('dialogue',false); i.activate();
  assert.deepEqual(calls,['car','exit','exit']);
});
test('saved investigation restores dependencies independent of acquisition ordering', () => {
  const s=opened(); s.collect('ledger'); s.say('porter','show'); s.say('singer','show'); s.collect('order'); s.conclude('vale');
  const saved=JSON.parse(JSON.stringify(s.save())); saved.evidence.reverse(); saved.testimony.reverse();
  const recovered=createCaseState(RAILWAY_CASE);
  assert.equal(recovered.restore(saved),true);
  assert.deepEqual(new Set(recovered.snapshot().evidence),new Set(s.snapshot().evidence));
  assert.deepEqual(new Set(recovered.snapshot().testimony),new Set(s.snapshot().testimony));
  assert.deepEqual(recovered.snapshot().outcome,s.snapshot().outcome);
  recovered.reset(); assert.equal(recovered.save().suspectId,null);
});
test('invalid saves are rejected atomically and outcome prose is never trusted', () => {
  const s=opened(); const original=s.snapshot(); let notifications=0; s.subscribe(()=>notifications++);
  const save=s.save();
  for(const bad of [null,{...save,version:2},{...save,caseId:'other'},{...save,evidence:['order'],testimony:[]},{...save,testimony:['invented']},{...save,evidence:['docket','docket']},{...save,suspectId:'unknown'}]){
    assert.equal(s.restore(bad),false); assert.deepEqual(s.snapshot(),original);
  }
  assert.equal(notifications,0);
  assert.equal(s.restore({...save,suspectId:'vale',outcome:{verdict:'proved',text:'tampered'}}),true);
  assert.equal(s.snapshot().outcome.verdict,'unproven');
  assert.notEqual(s.snapshot().outcome.text,'tampered'); assert.equal(notifications,1);
});
