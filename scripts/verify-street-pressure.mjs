/** Actual driving, evasion and surrender on the Mac mini, including public Artifact frames. */
import assert from 'node:assert/strict';
import { hostname } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
if (!/mac[- ]?mini/i.test(hostname())) throw Error('Run on the Mac mini; Hamp uses the MacBook browser.');
if (!process.env.MC_QA_URL || process.env.MC_QA_ANONYMOUS !== '1') throw Error('An explicitly anonymous public-game acceptance URL is required.');
const browser = await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--password-store=basic','--use-mock-keychain']});
const context = await browser.newContext({viewport:{width:1440,height:900}});
const page = await context.newPage();
const output = resolve(process.env.MC_QA_OUTPUT || 'artifacts/street-pressure-acceptance');
await mkdir(output,{recursive:true});
const errors=[], steps=[];
let frame, activeStep='Boot', failure;
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>document.addEventListener('magic-city:ready',event=>{document.__qaWorld=event.detail;},true));
async function discoverWorld() {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timeout=setTimeout(()=>{settled=true;page.off('frameattached',watch);reject(Error('No playable game frame booted'));},30000);
    function watch(candidate) {
      candidate.waitForFunction(()=>!!document.__qaWorld,null,{timeout:30000}).then(()=>{
        if(settled)return;settled=true;clearTimeout(timeout);page.off('frameattached',watch);resolve(candidate);
      }).catch(()=>{});
    }
    page.on('frameattached',watch);page.frames().forEach(watch);
  });
}
async function boot(reload=false) {
  if(reload)await page.reload();else await page.goto(process.env.MC_QA_URL);
  frame=await discoverWorld();
  assert.ok(await frame.evaluate(()=>document.__qaWorld.getStreetPressure()),'Real police system boots');
}
async function startCase() {
  await frame.locator('#mc-title-click').click();
  await frame.getByRole('button',{name:/^(Take|Continue) the case ·/}).click();
}
async function step(name,run) {activeStep=name;await run();steps.push(name);}
async function pressure(){return frame.evaluate(()=>document.__qaWorld.getStreetPressure());}
async function closeJournal(){await frame.getByRole('button',{name:'Return to the streets · Escape',exact:true}).click();}
async function driveForAlert(touch=false) {
  await frame.evaluate(()=>document.__qaWorld.setSpawn(25,14,0));
  await frame.locator('#mc-read-prompt').filter({hasText:'DRIVE · the cream Lincoln'}).waitFor();
  await page.keyboard.press('e');
  await frame.locator('#mc-read-prompt').filter({hasText:'LEAVE CAR'}).waitFor();
  if(touch){
    await frame.evaluate(()=>document.exitPointerLock?.());
    await frame.locator('#mc-joystick').waitFor({state:'visible'});
    const box=await frame.locator('#mc-joystick').boundingBox();assert.ok(box);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-30);
  }else await page.keyboard.down('w');
  try {await frame.waitForFunction(()=>document.__qaWorld.getStreetPressure().heat>0,null,{timeout:15000});}
  finally {if(touch)await page.mouse.up();else await page.keyboard.up('w');}
}
try {
  await boot();
  const nativeStorage=await frame.evaluate(()=>{try{localStorage.removeItem('magic-city:case:last-train');return true;}catch(_){return false;}});
  if(nativeStorage)await boot(true);
  await startCase();
  await frame.evaluate(()=>document.__qaWorld.setSpawn(-420,-138,0));
  await frame.locator('#mc-read-prompt').filter({hasText:'INSPECT'}).waitFor();await page.keyboard.press('e');await closeJournal();
  await step('Visible patrols move through the existing crowd',async()=>{
    const before=await frame.evaluate(()=>document.__qaWorld.getPatrols());assert.equal(before.length,3);
    await frame.waitForFunction(before=>document.__qaWorld.getPatrols().some((actor,i)=>Math.hypot(actor.position[0]-before[i].position[0],actor.position[1]-before[i].position[1])>.3),before);
    assert.ok(before.every(actor=>actor.name.startsWith('Officer')));
  });
  await step('A nearby officer explains the rules through the shared interaction prompt',async()=>{
    const actor=await frame.evaluate(()=>document.__qaWorld.getPatrols()[0]);
    await frame.evaluate(position=>document.__qaWorld.setSpawn(position[0],position[1]+2,0),actor.position);
    await frame.locator('#mc-read-prompt').filter({hasText:'TALK · Officer Doyle'}).waitFor();
    const before=await frame.evaluate(()=>[document.__qaWorld.camera.position.x,document.__qaWorld.camera.position.z]);
    await page.keyboard.press('e');await frame.locator('#mc-police-dialog').waitFor({state:'visible'});
    assert.match(await frame.locator('#mc-police-dialog').textContent(),/below 27 miles an hour/);
    await page.screenshot({path:resolve(output,'patrol-conversation.png')});
    await frame.getByRole('button',{name:'Return to the streets · Escape',exact:true}).click();
    assert.equal((await pressure()).heat,0);
    assert.deepEqual(await frame.evaluate(()=>[document.__qaWorld.camera.position.x,document.__qaWorld.camera.position.z]),before);
  });
  await step('Actual witnessed reckless driving alerts patrols',async()=>{
    await driveForAlert();assert.ok((await pressure()).heat>0);
    await frame.locator('#mc-police-hud').waitFor({state:'visible'});
    assert.match(await frame.locator('#mc-driving-speed').textContent(), /[0-9]+ MPH/);
    await page.screenshot({path:resolve(output,'patrol-alert.png')});
  });
  await step('Stopping near an officer surrenders and custody blocks game input',async()=>{
    await page.keyboard.down('s');
    try{await frame.waitForFunction(()=>Math.abs(document.__qaWorld.getStreetPressure().speed)<1);}finally{await page.keyboard.up('s');}
    await frame.locator('#mc-police-dialog').waitFor({state:'visible',timeout:20000});
    assert.equal((await pressure()).phase,'detained');
    const before=await frame.evaluate(()=>document.__qaWorld.camera.position.toArray());
    await page.keyboard.press('j');await page.keyboard.press('m');await page.keyboard.press('e');
    await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');
    assert.deepEqual(await frame.evaluate(()=>document.__qaWorld.camera.position.toArray()),before);
    assert.equal(await frame.locator('#mc-case-dialog').isVisible(),false);
    assert.equal(await frame.locator('#mc-map-overlay').evaluate(el=>el.classList.contains('mc-hidden')),true);
    await page.screenshot({path:resolve(output,'precinct-custody.png')});
  });
  await step('Release preserves the collected detective evidence',async()=>{
    await frame.getByRole('button',{name:'Leave the precinct · resume the case',exact:true}).click();
    assert.equal((await pressure()).heat,0);assert.equal((await pressure()).arrests,1);
    await page.keyboard.press('j');assert.match(await frame.locator('#mc-case-dialog').textContent(),/✓ A torn freight docket/);await closeJournal();
  });
  await step('Real running breaks pursuit; the journal pauses patrols and the escape clock',async()=>{
    await boot(true);await startCase();await driveForAlert();await page.keyboard.press('e');
    await frame.evaluate(()=>{const p=document.__qaWorld.camera.position;document.__qaWorld.setSpawn(p.x,p.z,-90);});
    await page.keyboard.down('Shift');await page.keyboard.down('w');
    try {await frame.waitForFunction(()=>document.__qaWorld.getStreetPressure().phase==='searching');}
    finally {await page.keyboard.up('w');await page.keyboard.up('Shift');}
    await page.keyboard.press('j');await frame.locator('#mc-case-dialog').waitFor({state:'visible'});
    const paused=await pressure(),patrols=await frame.evaluate(()=>document.__qaWorld.getPatrols());
    await page.waitForTimeout(400);
    assert.equal((await pressure()).escapeRemaining,paused.escapeRemaining);
    assert.deepEqual(await frame.evaluate(()=>document.__qaWorld.getPatrols()),patrols);
    await closeJournal();await page.keyboard.down('Shift');await page.keyboard.down('w');
    try{await frame.waitForFunction(()=>document.__qaWorld.getStreetPressure().heat===0,null,{timeout:20000});}
    finally {await page.keyboard.up('w');await page.keyboard.up('Shift');}
    assert.equal(await frame.locator('#mc-police-hud').isVisible(),false);
    await page.screenshot({path:resolve(output,'pursuit-evaded.png')});
  });
  await step('Touch driving triggers pressure with a usable phone HUD',async()=>{
    await page.setViewportSize({width:390,height:844});await boot(true);await startCase();await driveForAlert(true);
    await frame.locator('#mc-police-hud').waitFor({state:'visible'});
    const badge=await frame.locator('#mc-police-hud').boundingBox(),caseHud=await frame.locator('#mc-case-hud').boundingBox();assert.ok(badge&&caseHud);
    assert.ok(badge.x>=0&&badge.x+badge.width<=390&&badge.y>=0&&badge.y+badge.height<=844);
    assert.ok(badge.y>=caseHud.y+caseHud.height || badge.x>=caseHud.x+caseHud.width,'Law and case HUDs do not overlap');
    const speed=await frame.locator('#mc-speedometer').boundingBox();assert.ok(speed);
    for(const selector of ['#mc-police-hud','#mc-joystick','#mc-touch-read-btn','#mc-touch-map-btn']){
      const control=await frame.locator(selector).boundingBox();assert.ok(control);
      assert.ok(speed.x+speed.width<=control.x || control.x+control.width<=speed.x || speed.y+speed.height<=control.y || control.y+control.height<=speed.y,'Dashboard does not overlap '+selector);
    }
    const stick=await frame.locator('#mc-joystick').boundingBox(),knob=await frame.locator('#mc-joystick-knob').boundingBox();
    assert.ok(stick&&knob);assert.ok(Math.abs(stick.x+stick.width/2-knob.x-knob.width/2)<1&&Math.abs(stick.y+stick.height/2-knob.y-knob.height/2)<1,'Released movement knob is visually centered');
    await page.screenshot({path:resolve(output,'phone-patrol-alert.png')});
  });
  assert.deepEqual(errors,[],'No uncaught game or Artifact errors');
}catch(error){failure=error;await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});}
finally{
  await browser.close();const url=new URL(process.env.MC_QA_URL);
  const report={status:failure?'failed':'passed',machine:hostname(),game:url.origin+url.pathname,steps,failedStep:failure?activeStep:null,error:failure?.message||null,pageErrors:errors,checkedAt:new Date().toISOString()};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,output}));
}
if(failure)throw failure;
