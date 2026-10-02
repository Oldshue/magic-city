/** Rendered acceptance on Hamp's Mac mini, using regular Chrome or an explicitly anonymous public-game context. */
import assert from 'node:assert/strict';
import { hostname } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (!/mac[- ]?mini/i.test(hostname())) throw new Error('Run this acceptance on the Mac mini; the MacBook browser is reserved for Hamp.');
if (!process.env.MC_QA_URL || (!process.env.MC_QA_CDP && process.env.MC_QA_ANONYMOUS !== '1')) throw new Error('Set MC_QA_URL and either the regular Chrome MC_QA_CDP endpoint or MC_QA_ANONYMOUS=1 for public-game acceptance.');
const { chromium } = await import('playwright');
const browser = process.env.MC_QA_CDP
  ? await chromium.connectOverCDP(process.env.MC_QA_CDP)
  : await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true, ignoreDefaultArgs: ['--password-store=basic', '--use-mock-keychain'] });
const context = process.env.MC_QA_CDP ? browser.contexts()[0] : await browser.newContext();
assert.ok(context, 'Existing Chrome context required');
const hostPage = await context.newPage();
let worldFrame = hostPage;
let dialog;
async function discoverWorld(host) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => { settled = true; host.off('frameattached', watch); reject(new Error('No playable game frame booted within 30 seconds')); }, 30000);
    function watch(frame) {
      frame.waitForFunction(() => !!document.__qaWorld, null, {timeout: 30000}).then(() => {
        if (settled) return;
        settled = true; clearTimeout(timeout); host.off('frameattached', watch); resolve(frame);
      }).catch(() => {});
    }
    host.on('frameattached', watch);
    host.frames().forEach(watch);
  });
}
const page = new Proxy(hostPage, {get(host, key) {
  if (key === 'goto' || key === 'reload') return async (...args) => {
    const response = await host[key](...args);
    worldFrame = await discoverWorld(host);
    dialog = worldFrame.locator('#mc-case-dialog');
    return response;
  };
  const target = ['evaluate', 'locator', 'getByRole', 'waitForFunction'].includes(key) ? worldFrame : host;
  const value = target[key];
  return typeof value === 'function' ? value.bind(target) : value;
}});
const output = resolve(process.env.MC_QA_OUTPUT || 'artifacts/game-acceptance');
await mkdir(output, { recursive: true });
const faults = [];
const steps = [];
const key = 'magic-city:case:last-train';
let previousSave;
let activeStep = 'Connect and boot';
let failure = null;
page.on('pageerror', error => faults.push(error.message));
await page.addInitScript(() => {
  document.addEventListener('magic-city:ready', event => { document.__qaWorld = event.detail; }, true);
});

async function step(name, run) { activeStep = name; await run(); steps.push(name); }
async function move(x, z) {
  await page.evaluate(([x,z]) => document.__qaWorld.setSpawn(x,z,0),[x,z]);
  await page.waitForFunction(() => !document.querySelector('#mc-read-prompt').classList.contains('mc-hidden'));
}
async function interact(x,z,label) {
  await move(x,z);
  await page.locator('#mc-read-prompt').filter({hasText:label}).waitFor({state:'visible'});
  await page.keyboard.press('e'); await dialog.waitFor({state:'visible'});
}
async function choose(text) { await dialog.getByRole('button',{name:text,exact:true}).click(); }
async function close() { await dialog.getByRole('button',{name:'Return to the streets · Escape',exact:true}).click(); }
async function takeCase() {
  await page.locator('#mc-title-click').click();
  await page.waitForFunction(() => { const image=document.querySelector('#mc-case-portrait img'); return image.complete && image.naturalWidth>0; });
  await page.screenshot({path:resolve(output,'case-introduction.png')});
  await choose('Take the case · begin at Terminal Station');
}
async function openAccusation(suspect) {
  await interact(-390,-138,'REVIEW THE CASE');
  await choose(`Accuse ${suspect}`); await choose('Make the accusation');
}
async function gatherMinimum() {
  await interact(-420,-138,'INSPECT'); await close();
  await interact(-454,-138,'TALK'); await choose('Ask about the missing clerk.'); await close();
  await interact(300,49,'TALK'); await choose('Ask what she heard after her set.'); await close();
}
try {
  await page.goto(process.env.MC_QA_URL);
  await page.waitForFunction(() => !!document.__qaWorld);
  const storage = await page.evaluate(key => { try { return {available:true,value:localStorage.getItem(key)}; } catch (_) { return {available:false}; } },key);
  if(storage.available){previousSave=storage.value;await page.evaluate(key=>localStorage.removeItem(key),key);await page.reload();await page.waitForFunction(()=>!!document.__qaWorld);}
  else assert.equal(process.env.MC_QA_ANONYMOUS,'1','Isolated-frame acceptance uses a disposable anonymous context');
  await step('Fresh title and intro boot',takeCase);
  await step('Journal blocks movement and map input',async()=>{
    await page.keyboard.press('j');
    const before=await page.evaluate(()=>document.__qaWorld.camera.position.toArray());
    await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w'); await page.keyboard.press('m');
    assert.deepEqual(await page.evaluate(()=>document.__qaWorld.camera.position.toArray()),before);
    assert.equal(await page.locator('#mc-map-overlay').evaluate(el=>el.classList.contains('mc-hidden')),true);
    await close();
  });
  await step('Journal replaces a city document without an obscured dialog',async()=>{
    await move(-420,-150);
    await page.locator('#mc-read-prompt').filter({hasText:'READ ·'}).waitFor({state:'visible'});
    await page.keyboard.press('e');
    assert.equal(await page.locator('#mc-readable-panel').evaluate(el=>el.classList.contains('mc-hidden')),false);
    await page.keyboard.press('j'); await dialog.waitFor({state:'visible'});
    assert.equal(await page.locator('#mc-readable-panel').evaluate(el=>el.classList.contains('mc-hidden')),true);
    await close();
  });
  await step('Wrong accusation has distinct consequence',async()=>{
    await gatherMinimum(); await openAccusation('Isaac Bell · station porter');
    assert.match(await dialog.textContent(),/innocent man/);
    await choose('Reopen the case');
  });
  await step('Correct accusation without proof fails',async()=>{
    await gatherMinimum(); await openAccusation('Edgar Vale · freight dispatcher');
    assert.match(await dialog.textContent(),/solicitor dismantles/);
    await choose('Reopen the case');
  });
  await step('Independent evidence proves the case',async()=>{
    await interact(-420,-138,'INSPECT'); await close();
    await interact(-454,-138,'TALK'); await choose('Ask about the missing clerk.'); await choose('Show the altered freight docket.'); await close();
    await interact(-320,-88,'INSPECT'); await close();
    await interact(300,49,'TALK'); await choose('Ask what she heard after her set.'); await choose('Show her the hotel carbon copy.'); await close();
    await interact(150,-672,'INSPECT'); await close();
    await page.screenshot({path:resolve(output,'sloss-investigation.png')});
    await openAccusation('Edgar Vale · freight dispatcher');
    assert.match(await dialog.textContent(),/clerk comes home alive/);
    await page.screenshot({path:resolve(output,'case-proved.png')}); await close();
  });
  await step('Refresh restores evidence and verdict',async()=>{
    await page.reload(); await page.waitForFunction(()=>!!document.__qaWorld);
    await page.locator('#mc-title-click').click(); await choose('Continue the case · return to Terminal Station');
    await page.keyboard.press('j'); assert.match(await dialog.textContent(),/clerk comes home alive/);
    await choose('Reopen the case'); await page.keyboard.press('j');
    assert.match(await dialog.textContent(),/not collected/); await close();
  });
  await step('Responsive map keeps markers inside the map',async()=>{
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport); await page.keyboard.press('m');
      const boxes=await page.locator('#mc-map-canvas').boundingBox(); assert.ok(boxes);
      assert.ok(boxes.x>=0 && boxes.x+boxes.width<=viewport.width);
      const markers=await page.locator('.mc-map-waypoint').evaluateAll(nodes=>nodes.map(el=>({left:parseFloat(el.style.left),north:parseFloat(el.style.insetBlockStart)})));
      assert.ok(markers.length); assert.ok(markers.every(p=>p.left>=0&&p.left<=100&&p.north>=0&&p.north<=100));
      await page.screenshot({path:resolve(output,`map-${viewport.width}.png`)});
      await page.keyboard.press('j'); assert.equal(await dialog.isVisible(),false);
      await page.keyboard.press('m');
    }
  });
  await step('Drive, journal pause, park and return to walking',async()=>{
    await page.setViewportSize({width:1440,height:900});
    await move(25,14);
    await page.locator('#mc-read-prompt').filter({hasText:'DRIVE · the cream Lincoln'}).waitFor({state:'visible'});
    await page.keyboard.press('e');
    await page.locator('#mc-read-prompt').filter({hasText:'LEAVE CAR'}).waitFor({state:'visible'});
    const before=await page.evaluate(()=>document.__qaWorld.camera.position.toArray());
    await page.keyboard.down('w');
    await page.waitForFunction(before=>document.__qaWorld.camera.position.distanceTo({x:before[0],y:before[1],z:before[2]})>2,before);
    await page.keyboard.up('w'); await page.keyboard.press('j');
    const paused=await page.evaluate(()=>document.__qaWorld.camera.position.toArray());
    await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
    assert.deepEqual(await page.evaluate(()=>document.__qaWorld.camera.position.toArray()),paused);
    await close(); await page.keyboard.press('e');
    await page.waitForFunction(()=>Math.abs(document.__qaWorld.camera.position.y-1.7)<.1);
    await page.screenshot({path:resolve(output,'vehicle-handoff.png')});
  });
  await step('Existing touch stick drives and modal blocks its input',async()=>{
    await page.setViewportSize({width:390,height:844});
    await page.reload();
    await page.locator('#mc-title-click').click();
    await dialog.getByRole('button',{name:/^(Take|Continue) the case ·/}).click();
    await move(25,14);
    await page.locator('#mc-read-prompt').filter({hasText:'DRIVE'}).waitFor({state:'visible'});
    await page.keyboard.press('e');
    await page.locator('#mc-read-prompt').filter({hasText:'LEAVE CAR'}).waitFor({state:'visible'});
    await page.locator('#mc-joystick').hover();
    await page.evaluate(()=>{document.__qaPointer={}; document.addEventListener('pointerdown',e=>{document.__qaPointer.documentDown={x:e.clientX,y:e.clientY,target:e.target.id,className:e.target.className};},true); for(const type of ['pointerdown','pointermove'])document.querySelector('#mc-joystick').addEventListener(type,e=>{document.__qaPointer[type]={x:e.clientX,y:e.clientY,target:e.target.id};});});
    const stick=await page.locator('#mc-joystick').boundingBox(); assert.ok(stick);
    const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
    const before=await page.evaluate(()=>document.__qaWorld.camera.position.toArray());
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x,y-30);
    try {
      await page.waitForFunction(before=>document.__qaWorld.camera.position.distanceTo({x:before[0],y:before[1],z:before[2]})>2,before);
      await page.keyboard.press('j');
      const paused=await page.evaluate(()=>document.__qaWorld.camera.position.toArray());
      await page.mouse.move(x-12,y-30); await page.waitForTimeout(400);
      assert.deepEqual(await page.evaluate(()=>document.__qaWorld.camera.position.toArray()),paused);
    } finally { await page.mouse.up(); }
    await close(); await page.keyboard.press('e');
    await page.waitForFunction(()=>Math.abs(document.__qaWorld.camera.position.y-1.7)<.1);
    await page.screenshot({path:resolve(output,'touch-driving-handoff.png')});
  });
  await step('Storage denial preserves playable evidence collection' ,async()=>{
    const denied=await context.newPage();
    try {
      denied.on('pageerror',error=>faults.push(error.message));
      await denied.addInitScript(()=>{
        Storage.prototype.getItem=function(){throw new Error('QA storage denied');};
        Storage.prototype.setItem=function(){throw new Error('QA storage denied');};
        document.addEventListener('magic-city:ready',event=>{document.__qaWorld=event.detail;},true);
      });
      await denied.goto(process.env.MC_QA_URL); const deniedFrame = await discoverWorld(denied);
      await deniedFrame.locator('#mc-title-click').click();
      await deniedFrame.getByRole('button',{name:'Take the case · begin at Terminal Station',exact:true}).click();
      await deniedFrame.evaluate(()=>document.__qaWorld.setSpawn(-420,-138,0));
      await deniedFrame.locator('#mc-read-prompt').filter({hasText:'INSPECT'}).waitFor({state:'visible'});
      await denied.keyboard.press('e');
      await deniedFrame.getByRole('button',{name:'Return to the streets · Escape',exact:true}).click();
      await denied.keyboard.press('j');
      assert.match(await deniedFrame.locator('#mc-case-dialog').textContent(),/✓ A torn freight docket/);
    } finally { await denied.close(); }
  });
  assert.deepEqual(faults,[], 'No uncaught page errors');
 } catch (error) {
  failure = error;
  console.log(JSON.stringify({inputDiagnostic:await page.evaluate(()=>({pointer:document.__qaPointer,lock:document.pointerLockElement?.tagName,position:document.__qaWorld?.camera.position.toArray(),pressure:document.__qaWorld?.getStreetPressure(),stick:document.querySelector('#mc-joystick')?.getBoundingClientRect().toJSON(),knob:document.querySelector('#mc-joystick-knob')?.style.transform})).catch(e=>String(e))}));
  await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
} finally {
  if (previousSave !== undefined) {
    try {
      await page.evaluate(({key,value})=>{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);},{key,value:previousSave});
    } catch (error) { failure ||= error; faults.push('Could not restore prior case save: '+error.message); }
  }
  try { await page.close(); } catch (error) { failure ||= error; }
  try { await browser.close(); } catch (error) { failure ||= error; } // Disconnect CDP; regular Chrome stays open.
  const url=new URL(process.env.MC_QA_URL);
  const report={status:failure?'failed':'passed',machine:hostname(),game:url.origin+url.pathname,steps,failedStep:failure?activeStep:null,error:failure?.message||null,pageErrors:faults,checkedAt:new Date().toISOString()};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,output}));
}
if (failure) throw failure;
