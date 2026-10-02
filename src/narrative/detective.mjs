import { createCaseState } from '../gameplay/case-state.mjs';
import { RAILWAY_CASE } from '../gameplay/railway-case.mjs';
import { createPersistentStorage } from '../gameplay/persistence.mjs';

/** Case presentation composes the existing world, movement and interaction APIs. */
export async function initDetective(ctx, root) {
  const investigation = createCaseState(RAILWAY_CASE);
  const storage = createPersistentStorage();
  const portraitUrl = new URL('../../data/art/samuel-price.png', import.meta.url).href;
  const saveKey = `magic-city:case:${RAILWAY_CASE.id}`;
  let restored = false;
  try {
    const saved = await storage.getItem(saveKey);
    if (saved) restored = investigation.restore(JSON.parse(saved));
  } catch (_) { /* Storage can be unavailable inside a preview; play still works. */ }
  investigation.subscribe(() => {
    storage.setItem(saveKey, JSON.stringify(investigation.save())).catch(() => {
      /* Private or unavailable storage must never stop the investigation. */
    });
  });
  const markers = [];
  let caseSnapshot = investigation.snapshot();
  investigation.subscribe(value => { caseSnapshot = value; if (active) publishWaypoints(); });
  let open = false;
  let active = false;
  let nextHud = 0;
  const ui = document.createElement('section');
  ui.id = 'mc-case-ui';
  ui.innerHTML = `<div id="mc-case-hud" hidden><small>CASE 01 / THE LAST TRAIN OUT</small><strong id="mc-case-objective"></strong><span id="mc-case-distance"></span><button id="mc-journal-button" type="button">J · Case journal</button></div><div id="mc-case-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-case-heading" hidden><article><small id="mc-case-kicker">DETECTIVE'S NOTEBOOK · 1929</small><h2 id="mc-case-heading"></h2><figure id="mc-case-portrait" hidden><img width="1254" height="1254" alt="Worn archival portrait of Samuel Price, the missing railway clerk"><figcaption>Samuel Price · missing railway clerk</figcaption></figure><p id="mc-case-copy"></p><div id="mc-case-choices"></div><button id="mc-case-close" type="button">Return to the streets · Escape</button></article></div>`;
  root.appendChild(ui);
  const style = document.createElement('style');
  style.textContent = `#mc-case-ui{font-family:Georgia,serif;color:#ebdfbf}#mc-case-ui [hidden]{display:none!important}#mc-case-hud{position:fixed;inset-block-start:105px;left:28px;width:min(320px,calc(100vw - 56px));padding:18px;border-left:2px solid #c49a51;background:linear-gradient(90deg,rgba(12,15,14,.9),rgba(12,15,14,.6));z-index:7;pointer-events:auto}#mc-case-hud small{font:10px Arial,sans-serif;letter-spacing:2px;color:#c49a51}#mc-case-hud strong{display:block;margin:9px 0;font-size:18px;font-weight:normal}#mc-case-distance{display:block;font-size:12px;color:#cfc0a0}#mc-case-ui button{font:13px Georgia,serif;border:1px solid #8d754d;background:#171e1b;color:#ebdfbf;padding:11px 14px;cursor:pointer;text-align:left}#mc-journal-button{margin-block-start:12px}#mc-case-dialog{position:fixed;inset:0;z-index:25;background:rgba(3,7,8,.8);display:flex;align-items:center;justify-content:center;pointer-events:auto;padding:20px;box-sizing:border-box}#mc-case-dialog article{background:#e7ddc3;color:#252b25;border:1px solid #a58349;box-shadow:0 20px 90px #0008;max-width:620px;width:100%;max-height:85vh;overflow:auto;padding:32px;box-sizing:border-box}#mc-case-dialog h2{font-size:32px;font-weight:normal;margin:14px 0}#mc-case-dialog p{font-size:17px;line-height:1.65;white-space:pre-line}#mc-case-kicker{font:10px Arial,sans-serif;letter-spacing:2px}#mc-case-portrait{float:right;width:140px;margin:0 0 16px 20px;transform:rotate(1deg)}#mc-case-portrait img{display:block;width:100%;height:auto;box-shadow:0 4px 12px #0003}#mc-case-portrait figcaption{font:10px Georgia,serif;text-align:center;margin-block-start:7px}#mc-case-choices{clear:both;display:grid;gap:9px;margin:18px 0}#mc-case-choices button:disabled{opacity:.5;cursor:default}#mc-case-close{background:transparent!important;color:#283128!important}#mc-case-ui button:focus-visible{outline:3px solid #b47c26;outline-offset:3px}@media(max-width:600px){#mc-case-hud{inset-block-start:90px;left:14px;width:230px;padding:12px}#mc-case-hud strong{font-size:15px}#mc-case-dialog article{padding:22px}#mc-case-dialog h2{font-size:25px}}`;
  document.head.appendChild(style);
  const dialog = ui.querySelector('#mc-case-dialog');
  const portrait = ui.querySelector('#mc-case-portrait');
  portrait.querySelector('img').src = portraitUrl;
  portrait.querySelector('img').addEventListener('error', () => { portrait.hidden = true; });
  function close() {
    open = false; dialog.hidden = true;
    ctx.interactions.block('case-dialog', false);
    ctx.controls.setInputBlocked('case-dialog', false);
    ui.querySelector('#mc-journal-button').focus();
  }
  function present(title, copy, choices = [], showPortrait = false) {
    root.dispatchEvent(new CustomEvent('magic-city:modal-open'));
    open = true; dialog.hidden = false; portrait.hidden = !showPortrait;
    ctx.interactions.block('case-dialog', true);
    ctx.controls.setInputBlocked('case-dialog', true);
    try { ctx.controls.controls.unlock(); } catch (_) { /* optional pointer lock */ }
    ui.querySelector('#mc-case-heading').textContent = title;
    ui.querySelector('#mc-case-copy').textContent = copy;
    const options = ui.querySelector('#mc-case-choices');
    options.replaceChildren();
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = choice.text; button.disabled = !!choice.disabled;
      button.addEventListener('click', choice.action); options.appendChild(button);
    }
    (options.querySelector('button:not(:disabled)') || ui.querySelector('#mc-case-close')).focus();
  }
  function journal() {
    if (!active || (!open && ctx.controls.isInputBlocked())) return;
    const state = investigation.snapshot();
    const lines = ['THE LAST TRAIN OUT', 'Find Samuel Price, the missing railway clerk.'];
    lines.push('\nCONTROLS\nWASD / arrows: move or drive · Shift: sprint · E: interact / leave car · J: journal · M: map · H: horn · Drag the scene to look. Touch: use the on-screen stick and interaction button.');
    lines.push('\nEVIDENCE');
    for (const clue of RAILWAY_CASE.clues) lines.push(state.evidence.includes(clue.id) ? `✓ ${clue.title}\n${clue.body}` : `— ${clue.title}: not collected`);
    lines.push('\nTESTIMONY');
    lines.push(state.testimony.includes('porter-route') ? 'Bell saw a hotel car leave the station.' : 'Speak with Isaac Bell at Terminal Station.');
    lines.push(state.testimony.includes('singer-route') ? 'Mercer saw the car head toward Sloss.' : 'Speak with Ruth Mercer outside the Savoy.');
    if (state.testimony.includes('porter-identification')) lines.push('Bell identified Vale from the freight docket.');
    if (state.testimony.includes('singer-identification')) lines.push('Mercer identified Vale from the hotel carbon copy.');
    if (state.outcome) lines.push(`\nCASE RESULT\n${state.outcome.text}`);
    present('Case journal', lines.join('\n'), state.outcome ? [{text:'Reopen the case',action:()=>{investigation.reset();close();}}] : [], true);
  }
  function witness(item, response = item.introduction) {
    present(item.name, response, item.choices.map(choice=>({text:choice.text,disabled:!investigation.has(choice.requires),action:()=>{const answer=investigation.say(item.id,choice.id);if(answer)witness(item,answer);}})));
  }
  function accusation() {
    present('Name the man behind the freight order', 'A name is easy. A case takes evidence. The docket and both witnesses open an accusation. The carbon copy, dispatch seal and independent identifications are what make it stand up.', RAILWAY_CASE.suspects.map(suspect=>({text:`Accuse ${suspect.name}`,disabled:!investigation.has(RAILWAY_CASE.accusationRequires),action:()=>{
      present('Put your name to it?', `Accuse ${suspect.name}? This closes the case. You can reopen it afterward.`,[{text:'Make the accusation',action:()=>{const result=investigation.conclude(suspect.id);if(result)present(result.verdict==='proved'?'CASE CLOSED · THE CLERK COMES HOME':'CASE CLOSED · A CITY KEEPS ITS SECRETS',result.text,[{text:'Reopen the case',action:()=>{investigation.reset();close();}}]);}},{text:'Review the evidence first',action:journal}]);
    }})));
  }
  function addMarker(item, type) {
    const g = new ctx.THREE.Group();
    if (type === 'witness') {
      ctx.characters.push({id:item.id,position:item.position,yawDeg:0,scale:1,paletteIdx:type==='witness' && item.id==='singer'?2:1,hatStyle:item.id==='singer'?1:0});
    } else {
      const envelope=new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(.7,.08,.45),ctx.materials.limestone);envelope.position.y=.7;g.add(envelope);
      const stand=new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(.9,.65,.6),ctx.materials.bronze);stand.position.y=.325;g.add(stand);
    }
    const sign=ctx.deco.canvasSign(type==='witness'?item.name.split(' · ')[0]:type==='desk'?'CASE OFFICE':'EVIDENCE',{width:2});sign.position.y=2.25;g.add(sign);
    g.position.set(item.position[0],0,item.position[1]);ctx.scene.add(g);
    const candidate = {distance:0,label:type==='witness'?`TALK · ${item.name}`:type==='desk'?'REVIEW THE CASE':`INSPECT · ${item.title}`,activate:()=>{
      if(type==='witness')witness(item);
      else if(type==='desk')accusation();
      else if(investigation.collect(item.id))present(item.title,item.body);
    }};
    markers.push({item,type,group:g,candidate});
  }
  RAILWAY_CASE.clues.forEach(item=>addMarker(item,'clue'));
  RAILWAY_CASE.witnesses.forEach(item=>addMarker(item,'witness'));
  addMarker({id:'case-office',name:'Case office',position:RAILWAY_CASE.accusationPosition},'desk');
  ctx.interactions.register(()=>{
    if(!active || open || caseSnapshot.outcome || ctx.controls.isInputBlocked())return null;
    let target=null;let distance=5;
    for(const marker of markers){
      if(marker.type==='clue' && (!investigation.has(marker.item.requires) || caseSnapshot.evidence.includes(marker.item.id)))continue;
      const d=Math.hypot(ctx.camera.position.x-marker.group.position.x,ctx.camera.position.z-marker.group.position.z);
      if(d<distance){target=marker;distance=d;}
    }
    if(!target)return null;
    target.candidate.distance=distance; return target.candidate;
  });
  function publishWaypoints() {
    const points = [];
    for (const clue of RAILWAY_CASE.clues) {
      if (investigation.has(clue.requires)) points.push({ id: clue.id, position: clue.position, label: clue.title, symbol: '◆', completed: investigation.has([clue.id]) });
    }
    for (const item of RAILWAY_CASE.witnesses) points.push({ id: item.id, position: item.position, label: item.name, symbol: '●', completed: investigation.has(item.choices.map(choice => choice.grants).filter(Boolean)) });
    if (investigation.has(RAILWAY_CASE.accusationRequires)) points.push({ id: 'case-office', position: RAILWAY_CASE.accusationPosition, label: 'Case office · make your accusation', symbol: '✦', completed: !!caseSnapshot.outcome });
    root.dispatchEvent(new CustomEvent('magic-city:waypoints', { detail: points }));
  }
  function objective() {
    if(caseSnapshot.outcome)return {text:'Case closed · open your journal to replay',position:null};
    if(!investigation.has(['docket']))return {text:'Inspect the docket outside Terminal Station',position:RAILWAY_CASE.clues[0].position};
    if(!investigation.has(['porter-route','porter-identification']))return {text:'Question Bell · show him the docket',position:RAILWAY_CASE.witnesses[0].position};
    if(!investigation.has(['ledger']))return {text:'Follow the hotel lead to the Tutwiler',position:RAILWAY_CASE.clues[1].position};
    if(!investigation.has(['singer-route','singer-identification']))return {text:'Find Ruth Mercer outside the Savoy',position:RAILWAY_CASE.witnesses[1].position};
    if(!investigation.has(['order']))return {text:'Trace the freight order to Sloss',position:RAILWAY_CASE.clues[2].position};
    return {text:'Return to the station · make your accusation',position:RAILWAY_CASE.accusationPosition};
  }
  function tick(time) {
    requestAnimationFrame(tick);
    if(!active || time<nextHud)return;nextHud=time+150;
    const next=objective();ui.querySelector('#mc-case-objective').textContent=next.text;
    if(next.position){const dx=next.position[0]-ctx.camera.position.x,dz=next.position[1]-ctx.camera.position.z;ui.querySelector('#mc-case-distance').textContent=`${Math.round(Math.hypot(dx,dz))} m · ${dz<0?'N':'S'}${dx<0?'W':'E'} · M for city map`;}
    else ui.querySelector('#mc-case-distance').textContent='Your choices are recorded in the journal.';
  }
  ui.querySelector('#mc-case-close').addEventListener('click',close);
  ui.querySelector('#mc-journal-button').addEventListener('click',journal);
  document.addEventListener('keydown',e=>{
    if(!active || e.repeat)return;
    if(e.code==='KeyJ'){e.preventDefault();if(open)close();else journal();}
    else if(e.code==='Escape' && open){e.stopImmediatePropagation();close();}
    else if(e.code==='Tab' && open){
      const buttons=[...dialog.querySelectorAll('button:not(:disabled)')];const i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
    }
  },true);
  root.addEventListener('magic-city:play',()=>{active=true;publishWaypoints();ui.querySelector('#mc-case-hud').hidden=false;present(RAILWAY_CASE.title,restored ? 'Your notebook survived the night. Evidence and testimony from your previous investigation are waiting in the case journal.' : RAILWAY_CASE.introduction,[{text:restored ? 'Continue the case · return to Terminal Station' : 'Take the case · begin at Terminal Station',action:()=>{ctx.controls.setSpawn([-420,-128],0);close();}},{text:'Explore the city first',action:close}], true);},{once:true});
  requestAnimationFrame(tick);
  return investigation;
}
