import { createCounterVoices } from './counter-voices.mjs';
import { createPersistentStorage } from '../gameplay/persistence.mjs';
import { createShopState, SHOP_MENUS } from '../gameplay/shop-state.mjs';
import { getAudio, makeNoiseBuffer, makeRng } from '../systems/audioBus.js';

const SAVE = 'magic-city:counter-purchases';
const OWNER = 'counter-dialog';
const POURS_AT = 23/68;
const POURS_UNTIL = 41/68;
const CARRY_AT = 15/68;
const CARRY_UNTIL = 53/68;
const SERVE = 68/30;
const ease = value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};
const cost = cents=>cents>=100 ? '$'+(cents/100).toFixed(2) : cents+'¢';

export async function initCounterService(ctx,root) {
  const counters = ctx.shopCounters || [];
  if (!counters.length) return null;
  const state = createShopState();
  const storage = createPersistentStorage();
  try {
    const data = await storage.getItem(SAVE);
    if (data) state.restore(JSON.parse(data));
  } catch (_) { /* The counter keeps working in a private or isolated browser. */ }
  const ui = document.createElement('section');
  ui.id = 'mc-counter-ui';
  ui.innerHTML = `<div id="mc-counter-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-counter-speaker" hidden>
    <header><span id="mc-counter-place"></span><span id="mc-counter-cash"></span></header>
    <h2 id="mc-counter-speaker"></h2>
    <p id="mc-counter-line" aria-live="polite"></p>
    <div id="mc-counter-choices"></div>
  </div><div id="mc-counter-receipt" role="status" hidden></div>`;
  root.appendChild(ui);
  const style = document.createElement('style');
  style.textContent = `
    #mc-counter-ui [hidden]{display:none!important}
    .mc-counter-open #mc-touch-controls{visibility:hidden}
    #mc-counter-dialog{position:fixed;z-index:27;inset:auto 0 max(20px,env(safe-area-inset-bottom));margin-inline:auto;
      width:min(630px,calc(100vw - 30px));box-sizing:border-box;padding:16px 20px;border:1px solid #987b4d;
      border-top:2px solid #c2a269;background:#101915f2;color:#f2e6c8;font:16px Georgia,serif;
      box-shadow:0 14px 46px #0008;pointer-events:auto}
    #mc-counter-dialog header{display:flex;justify-content:space-between;gap:10px;color:#d5b882;font:11px Arial,sans-serif;
      letter-spacing:.07em}
    #mc-counter-dialog h2{margin:8px 0 2px;font:normal 22px Georgia,serif}
    #mc-counter-dialog p{margin:6px 0 12px;line-height:1.41}
    #mc-counter-choices{display:flex;gap:7px;flex-wrap:wrap}
    #mc-counter-choices button{border:1px solid #8d754d;padding:9px 12px;background:#25332c;color:#f2e6c8;
      font:14px Georgia,serif;cursor:pointer;text-align:left}
    #mc-counter-choices button:focus-visible{outline:2px solid #f3d28e;outline-offset:2px}
    #mc-counter-choices button:disabled{opacity:.5;cursor:default}
    #mc-counter-receipt{position:fixed;z-index:23;left:50%;transform:translateX(-50%);bottom:104px;max-width:90vw;
      padding:11px 15px;border:1px solid #987b4d;background:#101915f2;color:#f2e6c8;font:14px Georgia,serif}
    @media(max-width:600px){#mc-counter-dialog{padding:14px 15px}#mc-counter-choices button{min-height:44px}
      #mc-counter-receipt{bottom:185px}}`;
  document.head.appendChild(style);

  const dialog = ui.querySelector('#mc-counter-dialog'), choices = ui.querySelector('#mc-counter-choices');
  const location = ui.querySelector('#mc-counter-place'), cash = ui.querySelector('#mc-counter-cash');
  const speaker = ui.querySelector('#mc-counter-speaker'), line = ui.querySelector('#mc-counter-line');
  const receipt = ui.querySelector('#mc-counter-receipt');
  const scratch = new ctx.THREE.Vector3(), focus = new ctx.THREE.Vector3(), aim = new ctx.THREE.Quaternion();
  const rng = makeRng(32099);
  const voices = createCounterVoices();
  const defaultFov = ctx.camera.fov;
  let open, cameraTime = 0, toastTime = 0, audioNoise;

  function sound(phase,kind) {
    const audio=getAudio();
    if (!audio) return;
    const {ctx:ac,master}=audio;
    audioNoise ??= makeNoiseBuffer(ac,1.12,rng);
    const tap = phase==='set down';
    const source = ac.createBufferSource();
    source.buffer = audioNoise;
    const tone = ac.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = tap ? 1960 : kind==='chemist' ? 1280 : 554;
    tone.Q.value = tap ? 3.1 : .74;
    const envelope = ac.createGain();
    const now=ac.currentTime, duration=tap ? .14 : .58;
    envelope.gain.setValueAtTime(.001,now);
    envelope.gain.linearRampToValueAtTime(tap ? .115 : .148,now+.039);
    envelope.gain.exponentialRampToValueAtTime(.001,now+duration);
    source.connect(tone).connect(envelope).connect(master);
    source.start(now,0,duration);
  }

  function close() {
    if (!open) return;
    open = null;
    voices.stop();
    dialog.hidden = true;
    root.classList.remove('mc-counter-open');
    choices.replaceChildren();
    ctx.controls.setInputBlocked(OWNER,false);
    ctx.interactions.block(OWNER,false);
  }

  function action(text,run,disabled=false) {
    const button = document.createElement('button');
    button.type='button'; button.textContent=text; button.disabled=disabled;
    button.addEventListener('click',run);
    choices.appendChild(button);
  }

  function perform(counter,clip,duration) {
    counter.performance = {clip,duration,time:0,phase:0};
    counter.actor.performance = counter.performance;
  }

  function consume(counter) {
    if (!state.collect(counter.kind)) return;
    counter.service.group.visible=false;
    counter.service.stream.visible=false;
    counter.actor.carries=null;
    storage.setItem(SAVE,JSON.stringify(state.save())).catch(()=>{});
    const menu=SHOP_MENUS[counter.kind];
    receipt.textContent = menu.item+' · '+cost(menu.price)+' spent · '+cost(state.cash())+' left';
    receipt.hidden=false; toastTime=3.65;
    sound('set down',counter.kind);
    close();
  }

  function serve(counter) {
    if (!state.order(counter.kind)) return;
    const {group,stock,filled}=counter.service;
    group.position.set(...stock);group.visible=true;filled.scale.y=.02;
    perform(counter,'Serve',SERVE);
    draw(counter);
  }

  function draw(counter,message) {
    const kind=counter.kind, menu=SHOP_MENUS[kind], phase=state.status(kind);
    location.textContent=counter.name;
    cash.textContent=cost(state.cash())+' in pocket';
    speaker.textContent=menu.person;
    const dialogue=message || (phase==='ready' ? 'ready' : phase==='serving' ? 'ordered'
      : state.visited(kind) ? 'familiar' : 'greeting');
    line.textContent=menu[dialogue];
    voices.play(counter,dialogue);
    choices.replaceChildren();
    if (phase==='ready') action('Take '+menu.item.toLowerCase()+' · '+cost(menu.price),()=>consume(counter));
    if (!phase) {
      action('Order '+menu.item.toLowerCase()+' · '+cost(menu.price),()=>serve(counter),state.available()<menu.price);
      action(menu.question,()=>{perform(counter,'Speak',56/30);draw(counter,'reply');});
    }
    action('Leave the counter',close);
    (choices.querySelector('button:not(:disabled)') || dialog).focus();
  }

  function approach(counter) {
    if (state.status(counter.kind)==='ready') {
      consume(counter);
      return;
    }
    root.dispatchEvent(new CustomEvent('magic-city:modal-open'));
    open=counter; cameraTime=0;
    dialog.hidden=false;
    root.classList.add('mc-counter-open');
    ctx.controls.setInputBlocked(OWNER,true);
    ctx.interactions.block(OWNER,true);
    try {ctx.controls.controls.unlock();} catch (_) { /* Pointer lock is optional. */ }
    if (!state.status(counter.kind)) perform(counter,'Greet',34/30);
    draw(counter);
  }

  for (const counter of counters) {
    const menu=SHOP_MENUS[counter.kind];
    const interact = {label:'',distance:0,priority:8,activate:()=>approach(counter)};
    ctx.interactions.register(()=>{
      if (open) return null;
      counter.shop.worldToLocal(scratch.copy(ctx.camera.position));
      // The glass and the storefront jambs separate the sidewalk from service.
      if (scratch.z>=-.98 || scratch.z< -2.32 || Math.abs(scratch.x)>1.53
          || scratch.y<.68 || scratch.y>2.45) return null;
      const phase=state.status(counter.kind);
      interact.distance=Math.hypot(scratch.x,scratch.z+2.04);
      interact.label=phase==='ready' ? 'TAKE · '+menu.item+' · '+cost(menu.price) : 'TALK · '+menu.person;
      return interact;
    });
  }

  document.addEventListener('keydown',event=>{
    if (!open) return;
    if (event.code==='Escape') {
      event.preventDefault();event.stopImmediatePropagation();close();
    } else if (event.code==='Tab') {
      const buttons=Array.from(choices.querySelectorAll('button:not(:disabled)'));
      const current=buttons.indexOf(document.activeElement);
      const next=((current+(event.shiftKey ? -1:1))%buttons.length+buttons.length)%buttons.length;
      event.preventDefault();event.stopImmediatePropagation();buttons[next]?.focus();
    } else if (event.code==='KeyE' && !event.repeat && state.status(open.kind)==='ready') {
      event.preventDefault();event.stopImmediatePropagation();consume(open);
    }
  },true);

  function moveDrink(counter,pose,previous) {
    const {group,stock,edge,filled,stream,spout}=counter.service;
    const phase=pose.phase, ox=stock[0], oz=stock[2];
    if (previous<POURS_AT && phase>=POURS_AT) sound('pour',counter.kind);
    if (previous<CARRY_UNTIL && phase>=CARRY_UNTIL) sound('set down',counter.kind);
    const carry=ease((phase-CARRY_AT)/(1-CARRY_AT));
    group.position.set(ox+(edge[0]-ox)*carry,stock[1]+.135*Math.sin(Math.PI*carry),oz+(edge[2]-oz)*carry);
    if (phase>=CARRY_UNTIL) {
      const slide=ease((phase-CARRY_UNTIL)/(1-CARRY_UNTIL));
      group.position.set(-.18,edge[1],(-2.456)+(edge[2]+2.456)*slide);
    }
    counter.actor.carries=phase>=CARRY_AT && phase<CARRY_UNTIL ? group : null;
    filled.scale.y=Math.max(.02,ease((phase-POURS_AT)/(POURS_UNTIL-POURS_AT)));
    stream.visible=phase>=POURS_AT && phase<=POURS_UNTIL;
    if (stream.visible) {
      const flow=Math.max(.025,spout[1]-(group.position.y+.095));
      stream.scale.y=flow;
      stream.position.set(spout[0],spout[1]-flow/2,spout[2]);
    }
  }

  return {update(dt) {
    voices.update(dt);
    const targetFov = open ? defaultFov - 10 : defaultFov;
    if (ctx.camera.fov !== targetFov) {
      ctx.camera.fov += (targetFov - ctx.camera.fov) * (1 - Math.exp(-dt * 10));
      if (Math.abs(ctx.camera.fov - targetFov) < .02) ctx.camera.fov = targetFov;
      ctx.camera.updateProjectionMatrix();
    }
    toastTime=Math.max(0,toastTime-dt);
    if (toastTime===0) receipt.hidden=true;
    if (open && cameraTime<.39) {
      cameraTime+=dt;
      focus.set(0,1.40,-3.2);
      open.shop.localToWorld(focus);
      aim.copy(ctx.camera.quaternion);
      ctx.camera.lookAt(focus);
      ctx.camera.quaternion.slerp(aim,Math.exp(-dt*10));
    }
    for (const counter of counters) {
      const [x, z] = counter.actor.position;
      const player = ctx.camera.position;
      if (!counter.voicesPreloaded && Math.abs(player.y) < 8
          && (player.x-x)**2 + (player.z-z)**2 < 18**2) {
        counter.voicesPreloaded = voices.preload(counter.kind);
      }
      counter.actor.attending=open===counter;
      const pose=counter.performance;
      if (!pose) continue;
      const previous=pose.phase;
      pose.time+=dt;pose.phase=Math.min(1,pose.time/pose.duration);
      if (pose.clip==='Serve') {
        moveDrink(counter,pose,previous);
        if (pose.phase===1 && state.served(counter.kind) && open===counter) draw(counter);
      }
      if (pose.phase===1) {
        counter.performance=null;counter.actor.performance=null;
      }
    }
  }};
}
