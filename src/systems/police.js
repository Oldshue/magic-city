import { createStreetPressure, hasStreetSight } from '../gameplay/street-pressure.mjs';

const BEATS = [
  { id: 'corner-patrol', name: 'Officer Doyle', route: [[18, 8.5], [100, 8.5]] },
  { id: 'terminal-patrol', name: 'Officer Carter', route: [[-469, -124], [-469, -244]] },
  { id: 'furnace-patrol', name: 'Officer Webb', route: [[133, -688], [183, -688]] },
];
const SIGHT_RANGE = 55;
const PATROL_SPEED = 1.3;
const PURSUIT_SPEED = 8.4;

/** Patrols extend the existing instanced character declarations and named modal blockers. */
export function startPolice(ctx) {
  const pressure = createStreetPressure();
  const snapshot = {}, vehicle = {}, input = {};
  const actors = BEATS.map(beat => ({
    id: beat.id, name: beat.name, route: beat.route, routeIndex: 1,
    position: [...beat.route[0]], yawDeg: 90, scale: 1, paletteIdx: 1,
    hatStyle: 0, hatDark: true, trimColor: 0xb99752, moving: false, alerted: false,
  }));
  ctx.characters.push(...actors);
  const root = document.getElementById('mc-narrative-root') || document.body;
  const ui = document.createElement('section');
  ui.id = 'mc-police-ui';
  ui.innerHTML = '<aside id="mc-police-hud" hidden aria-live="polite"><small>THE LAW</small><strong id="mc-police-status"></strong><p id="mc-police-advice"></p></aside><div id="mc-police-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="mc-police-heading"><article><small>BIRMINGHAM POLICE DEPARTMENT · 1929</small><h2 id="mc-police-heading">An hour at the precinct</h2><p id="mc-police-reason"></p><p id="mc-police-copy">They take your statement and search your pockets. Your notebook survives. You leave with a warning and a city that remembers your face.</p><button type="button" id="mc-police-release">Leave the precinct · resume the case</button></article></div>';
  root.appendChild(ui);
  const style = document.createElement('style');
  style.textContent = '#mc-police-ui [hidden]{display:none!important}#mc-police-hud{position:fixed;right:28px;top:105px;z-index:7;width:210px;padding:16px;border-right:2px solid #b9794c;background:#151616e8;color:#e9d9b9;font-family:Georgia,serif}#mc-police-hud small{font:10px Arial,sans-serif;letter-spacing:2px;color:#b9794c}#mc-police-hud strong{display:block;font-size:19px;margin-top:8px}#mc-police-hud p{font-size:13px;line-height:1.5;margin-bottom:0}#mc-police-dialog{position:fixed;inset:0;z-index:28;display:flex;align-items:center;justify-content:center;padding:20px;background:#050908d9;box-sizing:border-box;font-family:Georgia,serif;pointer-events:auto}#mc-police-dialog article{width:100%;max-width:560px;max-height:85vh;overflow:auto;padding:32px;background:#e7ddc3;color:#252b25;border:1px solid #a58349;box-sizing:border-box}#mc-police-dialog small{font:10px Arial,sans-serif;letter-spacing:2px}#mc-police-dialog h2{font-size:30px;font-weight:normal}#mc-police-dialog p{font-size:17px;line-height:1.6}#mc-police-release{padding:13px;border:1px solid #8d754d;background:#171e1b;color:#ebdfbf;font:14px Georgia,serif;cursor:pointer}#mc-police-release:focus-visible{outline:3px solid #b47c26;outline-offset:3px}@media(max-width:600px){#mc-police-hud{top:auto;bottom:200px;right:14px;width:150px;padding:10px}#mc-police-hud strong{font-size:16px}#mc-police-dialog article{padding:22px}}';
  document.head.appendChild(style);
  const hud = ui.querySelector('#mc-police-hud');
  const status = ui.querySelector('#mc-police-status');
  const advice = ui.querySelector('#mc-police-advice');
  const dialog = ui.querySelector('#mc-police-dialog');
  const releaseButton = ui.querySelector('#mc-police-release');
  let active = false, inCustody = false, dialogOpen = false, lastImpact = 0, nextHud = 0;
  let seenX = ctx.camera.position.x, seenZ = ctx.camera.position.z;
  let priorX = seenX, priorZ = seenZ;

  function release() {
    const wasInCustody = inCustody;
    inCustody = false; dialogOpen = false; dialog.hidden = true;
    ctx.interactions.block('police-dialog', false);
    ctx.controls.setInputBlocked('police-dialog', false);
    if (wasInCustody) {
      pressure.release(); pressure.snapshot(snapshot);
      ctx.controls.setSpawn([-390, -128], 0);
      priorX = -390; priorZ = -128;
      for (const actor of actors) actor.alerted = false;
      hud.hidden = true;
    }
  }
  releaseButton.addEventListener('click', release);
  document.addEventListener('keydown', event => {
    if (!dialogOpen) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); release(); }
    else if (event.code === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); releaseButton.focus(); }
  }, true);
  root.addEventListener('magic-city:play', () => { active = true; }, { once: true });

  function showDialog(heading, reason, copy, custody) {
    inCustody = custody; dialogOpen = true;
    root.dispatchEvent(new CustomEvent('magic-city:modal-open'));
    ctx.interactions.block('police-dialog', true);
    ctx.controls.setInputBlocked('police-dialog', true);
    try { ctx.controls.controls.unlock(); } catch (_) { /* Pointer capture remains optional. */ }
    ui.querySelector('#mc-police-heading').textContent = heading;
    ui.querySelector('#mc-police-reason').textContent = reason;
    ui.querySelector('#mc-police-copy').textContent = copy;
    releaseButton.textContent = custody ? 'Leave the precinct · resume the case' : 'Return to the streets · Escape';
    dialog.hidden = false; hud.hidden = true; releaseButton.focus();
  }
  function detain() {
    ctx.driving.park(); ctx.driving.getState(vehicle);
    showDialog('An hour at the precinct', snapshot.reason,
      'They take your statement and search your pockets. Your notebook survives. You leave with a warning and a city that remembers your face.', true);
  }
  function talk(actor) {
    if (snapshot.heat) { if (!pressure.surrender()) return; pressure.snapshot(snapshot); detain(); }
    else showDialog(actor.name, '“Easy with that motorcar, detective. Keep it below 27 miles an hour when a patrol can see you.”',
      '“A dangerous driver draws a tail. Put a block between you and the badge, then keep moving until the streets forget. Stand still near an officer if you mean to surrender. The city has enough missing men without losing you.”', false);
  }
  for (const actor of actors) actor.interaction = {distance:0, label:'TALK · '+actor.name, activate:()=>talk(actor)};
  ctx.interactions.register(() => {
    if (!active || dialogOpen) return null;
    let nearest = null, distance = 4.5;
    for (const actor of actors) {
      const d = Math.hypot(actor.position[0] - ctx.camera.position.x, actor.position[1] - ctx.camera.position.z);
      if (d < distance && hasStreetSight(actor.position[0], actor.position[1], ctx.camera.position.x, ctx.camera.position.z, ctx.controls.getColliderBoxes())) { nearest = actor; distance = d; }
    }
    if (!nearest) return null;
    nearest.interaction.distance = distance;
    nearest.interaction.label = (snapshot.heat ? 'SURRENDER · ' : 'TALK · ') + nearest.name;
    return nearest.interaction;
  });
  function canMove(x, z, boxes) {
    for (const box of boxes) if (x > box.minX - .35 && x < box.maxX + .35 && z > box.minZ - .35 && z < box.maxZ + .35) return false;
    return true;
  }
  function moveActor(actor, x, z, speed, dt, boxes) {
    const dx = x - actor.position[0], dz = z - actor.position[1], distance = Math.hypot(dx, dz);
    actor.moving = false;
    if (distance < .5) return true;
    const step = Math.min(distance, speed * dt);
    const nx = actor.position[0] + dx / distance * step, nz = actor.position[1] + dz / distance * step;
    const oldX = actor.position[0], oldZ = actor.position[1];
    if (canMove(nx, nz, boxes)) { actor.position[0] = nx; actor.position[1] = nz; }
    else if (canMove(nx, oldZ, boxes)) actor.position[0] = nx;
    else if (canMove(oldX, nz, boxes)) actor.position[1] = nz;
    actor.moving = actor.position[0] !== oldX || actor.position[1] !== oldZ;
    if (actor.moving) actor.yawDeg = Math.atan2(actor.position[0] - oldX, actor.position[1] - oldZ) * 180 / Math.PI;
    return distance <= step + .5;
  }
  return {
    update(dt, elapsed) {
      if (!active || ctx.controls.isInputBlocked()) { for (const actor of actors) actor.moving = false; return; }
      ctx.driving.getState(vehicle);
      const px = vehicle.x, pz = vehicle.z;
      const boxes = ctx.controls.getColliderBoxes();
      let visible = false, nearestDistance = Infinity;
      for (const actor of actors) {
        const distance = Math.hypot(actor.position[0] - px, actor.position[1] - pz);
        const sees = distance <= SIGHT_RANGE && hasStreetSight(actor.position[0], actor.position[1], px, pz, boxes);
        if (sees) { visible = true; nearestDistance = Math.min(nearestDistance, distance); }
        if (sees && snapshot.heat) actor.alerted = true;
      }
      if (visible) { seenX = px; seenZ = pz; }
      input.visible = visible; input.nearestDistance = nearestDistance;
      input.driving = vehicle.driving; input.speed = vehicle.driving ? vehicle.speed : dt > 0 ? Math.hypot(px - priorX, pz - priorZ) / dt : 0;
      input.crashed = vehicle.impactSequence !== lastImpact;
      lastImpact = vehicle.impactSequence; priorX = px; priorZ = pz;
      pressure.update(dt, input); pressure.snapshot(snapshot);
      if (snapshot.phase === 'detained') { detain(); return; }
      for (const actor of actors) {
        if (!snapshot.heat) actor.alerted = false;
        if (snapshot.heat && Math.hypot(actor.position[0] - seenX, actor.position[1] - seenZ) < SIGHT_RANGE) actor.alerted = true;
        if (actor.alerted) moveActor(actor, seenX, seenZ, PURSUIT_SPEED, dt, boxes);
        else {
          const target = actor.route[actor.routeIndex];
          if (moveActor(actor, target[0], target[1], PATROL_SPEED, dt, boxes)) actor.routeIndex = (actor.routeIndex + 1) % actor.route.length;
        }
      }
      if (!snapshot.heat && !hud.hidden) hud.hidden = true;
      if (elapsed < nextHud) return; nextHud = elapsed + .15;
      hud.hidden = !snapshot.heat;
      if (snapshot.heat) {
        status.textContent = snapshot.phase === 'searching' ? 'Lose the tail' : snapshot.heat === 2 ? '★★ Police pursuit' : '★ Patrol alerted';
        advice.textContent = snapshot.phase === 'searching' ? `Stay out of sight · ${Math.ceil(snapshot.escapeRemaining)} seconds` : 'Break their line of sight to lose the pursuit. Stop near an officer to surrender.';
      }
    },
    snapshot(out = {}) { pressure.snapshot(out); out.driving = vehicle.driving || false; out.speed = vehicle.speed || 0; return out; },
    patrols() { return actors.map(actor => ({ id: actor.id, name: actor.name, position: [...actor.position], alerted: actor.alerted })); },
  };
}
