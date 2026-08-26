/**
 * narrative/index.js — the narrative & UI layer of Magic City 1929.
 *
 * Owns every HTML/CSS overlay: the deco title card, the minimal walking HUD
 * (compass, district name, E-to-read prompt), the paper/plaque readables
 * panel (with newspaper masthead treatment), the M-key stylized map, the
 * five-plaque Divergence exhibit that teaches Pittsburgh Plus by walking and
 * reading, and — for anyone without a keyboard/mouse willing to grant
 * pointer lock (iPads, iframes, denied permissions) — an on-screen joystick
 * and E/M tap buttons. Exported per TECH-CONTRACT.md: `export async
 * function initNarrative(ctx)` — called once, after all districts are
 * built, from src/main.js.
 *
 * Playability contract: tapping/clicking "CLICK TO WALK" / "TAP TO EXPLORE"
 * ALWAYS dismisses the title card and starts the world. Pointer lock is
 * requested alongside as an optional desktop upgrade — never a gate. When
 * lock isn't held, src/engine/controls.js's drag-to-look and
 * setVirtualMove() (fed here by the on-screen joystick) keep the player
 * fully in control.
 *
 * Design notes:
 * - Runs its own lightweight requestAnimationFrame loop (never touches
 *   ctx.scene/renderer per frame beyond reading camera.position), so it can
 *   never block the WebGL frame loop in main.js.
 * - Proximity/readable lookups reuse a couple of scratch THREE.Vector3
 *   instances instead of allocating one per interactive per tick.
 * - Input works via keyboard/mouse *or* touch: click/tap to start, E to
 *   read, M to map, Escape/tap-outside/walking-away to close, mouse-drag or
 *   one-finger drag to look when pointer lock isn't held, on-screen
 *   joystick to walk.
 * - Hermetic: every listener here is registered on `document` or on
 *   elements owned by this module (never a browsing-context root), and
 *   `isTouchPrimary()` below feature-detects without referencing `window`.
 */
import { NARRATIVE_CSS } from './style.js';
import { DIVERGENCE_EXHIBIT, detectMasthead } from './content.js';
import { findDistrict } from './geoUtils.js';
import { drawBaseMap, worldToMap } from './mapRenderer.js';

const READ_RADIUS = 9; // meters — shows the [E] READ prompt / touch READ button
const CLOSE_RADIUS = 13; // meters — walking this far from an open readable closes it
const MAP_SIZE = 760; // px — fixed square map canvas resolution

/**
 * @param {object} ctx { THREE, scene, camera, renderer, plan, materials,
 *   deco, registerInteractive, getDayPhase, interactives, controls }
 */
export async function initNarrative(ctx) {
  injectStyle();
  const root = buildDom();
  document.body.appendChild(root);

  registerExhibit(ctx);

  const state = {
    titleFaded: false,
    hudVisible: false,
    mapOpen: false,
    openReadable: null,
    nearestReadable: null,
    currentDistrictSlug: undefined,
  };

  wireTitleCard(ctx, root, state);
  const keyHandlers = wireKeys(ctx, root, state);
  wireTouchControls(ctx, root, state, keyHandlers);
  wireModalDismiss(ctx, root, state);
  drawBaseMap(root.querySelector('#mc-map-canvas'), ctx.plan, MAP_SIZE);

  // Scratch vectors reused every tick — no per-frame allocation.
  const scratch = new ctx.THREE.Vector3();
  const forward = new ctx.THREE.Vector3();

  function tick() {
    requestAnimationFrame(tick);
    if (!state.hudVisible) return; // nothing to update before the title card is dismissed

    const bearing = updateCompassAndDistrict(ctx, root, state, forward);
    updateNearestReadable(ctx, root, state, scratch);

    if (state.openReadable) {
      state.openReadable.object.getWorldPosition(scratch);
      if (scratch.distanceTo(ctx.camera.position) > CLOSE_RADIUS) closeReadable(root, state);
    }
    if (state.mapOpen) updateMapMarker(ctx, root, bearing);
  }
  requestAnimationFrame(tick);
}

// --- Style + DOM construction -------------------------------------------
function injectStyle() {
  if (document.getElementById('mc-narrative-style')) return;
  const style = document.createElement('style');
  style.id = 'mc-narrative-style';
  style.textContent = NARRATIVE_CSS;
  document.head.appendChild(style);
}

function buildDom() {
  const root = document.createElement('div');
  root.id = 'mc-narrative-root';
  root.innerHTML = `
    <div id="mc-title-card" class="mc-title-card">
      <div class="mc-sunburst"></div>
      <div class="mc-title-content">
        <div class="mc-kicker">BIRMINGHAM &middot; ALABAMA &middot; 1929</div>
        <h1 class="mc-title-main">MAGIC CITY</h1>
        <div class="mc-title-year">1929</div>
        <div class="mc-title-rule"></div>
        <p class="mc-title-premise">Birmingham, as it might have been &mdash; had steel been priced fairly.</p>
        <div class="mc-title-click" id="mc-title-click">CLICK TO WALK</div>
      </div>
    </div>
    <div id="mc-hud" class="mc-hud mc-hidden">
      <div class="mc-compass">
        <div class="mc-compass-viewport"><div class="mc-compass-track" id="mc-compass-track"></div></div>
        <div class="mc-compass-marker"></div>
      </div>
      <div class="mc-district-name" id="mc-district-name">&nbsp;</div>
      <div class="mc-read-prompt mc-hidden" id="mc-read-prompt">[ E ]&nbsp; READ</div>
    </div>
    <div id="mc-readable-panel" class="mc-readable-panel mc-hidden">
      <div class="mc-readable-inner">
        <div class="mc-readable-masthead mc-hidden" id="mc-readable-masthead">
          <div class="mc-masthead-rule"></div>
          <div class="mc-masthead-name" id="mc-masthead-name"></div>
          <div class="mc-masthead-sub" id="mc-masthead-sub"></div>
          <div class="mc-masthead-rule"></div>
        </div>
        <h2 class="mc-readable-title" id="mc-readable-title"></h2>
        <div class="mc-readable-rule"></div>
        <p class="mc-readable-body" id="mc-readable-body"></p>
        <div class="mc-readable-hint">ESC, TAP, OR WALK AWAY TO CLOSE</div>
      </div>
    </div>
    <div id="mc-map-overlay" class="mc-map-overlay mc-hidden">
      <div class="mc-map-frame">
        <div class="mc-map-cartouche">MAGIC CITY 1929<span>STEEL CAPITAL OF THE SOUTH</span></div>
        <div class="mc-map-canvas-wrap">
          <canvas id="mc-map-canvas" width="${MAP_SIZE}" height="${MAP_SIZE}"></canvas>
          <div class="mc-map-marker" id="mc-map-marker"></div>
        </div>
        <div class="mc-map-hint">M OR TAP OUTSIDE&nbsp; TO CLOSE</div>
      </div>
    </div>
    <div id="mc-touch-controls" class="mc-touch-controls mc-hidden">
      <div class="mc-joystick" id="mc-joystick">
        <div class="mc-joystick-base"></div>
        <div class="mc-joystick-knob" id="mc-joystick-knob"></div>
      </div>
      <div class="mc-touch-buttons">
        <button type="button" class="mc-touch-btn mc-touch-btn-read mc-hidden" id="mc-touch-read-btn">READ</button>
        <button type="button" class="mc-touch-btn mc-touch-btn-map" id="mc-touch-map-btn">MAP</button>
      </div>
    </div>
  `;
  return root;
}

/** Builds the scrolling compass ticker's label markup (16-point compass). */
function compassLabels() {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const pxPerDeg = 4;
  let html = '';
  for (let deg = 0; deg <= 405; deg += 22.5) {
    const label = names[Math.round(deg / 22.5) % 16];
    html += `<span class="mc-compass-label" style="left:${(deg * pxPerDeg).toFixed(1)}px">${label}</span>`;
  }
  return html;
}

// --- The Divergence exhibit ---------------------------------------------
/** Builds a small bronze post + canvas-sign plaque and registers it as a
 * readable, reusing the shared deco.canvasSign / materials.bronze helpers. */
function buildPlaque(ctx, title) {
  const group = new ctx.THREE.Group();
  const post = new ctx.THREE.Mesh(
    new ctx.THREE.CylinderGeometry(0.06, 0.08, 1.6, 8),
    ctx.materials.bronze
  );
  post.position.y = 0.8;
  group.add(post);
  const label = title.length > 34 ? title.slice(0, 34) + '…' : title;
  const sign = ctx.deco.canvasSign(label, { width: 2.6 });
  sign.position.y = 1.7;
  group.add(sign);
  return group;
}

function registerExhibit(ctx) {
  for (const item of DIVERGENCE_EXHIBIT) {
    const marker = buildPlaque(ctx, item.title);
    marker.position.set(item.position[0], 0, item.position[1]);
    ctx.scene.add(marker);
    ctx.registerInteractive(marker, { title: item.title, body: item.body });
  }
}

// --- Title card -----------------------------------------------------------
/** True if the primary input mechanism is touch (tablets/phones) rather than
 * a precise mouse — used only to pick the prompt copy ('TAP TO EXPLORE' vs
 * 'CLICK TO WALK'); never gates any actual behavior. Feature-detects via
 * plain global identifiers (`matchMedia`, `navigator`) and `document` —
 * never through a browsing-context root object, so this stays hermetic. */
function isTouchPrimary() {
  try {
    return !!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  } catch (_) {
    return (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      'ontouchstart' in document.documentElement;
  }
}

/** Fix (playability): dismissing the title card must never depend on
 * pointer lock succeeding — headless embeds, iframes, tablets, and browsers
 * that deny the Pointer Lock API would otherwise strand the player on the
 * title screen forever. A tap/click always dismisses it; pointer lock is
 * attempted alongside, purely as an optional upgrade for desktop
 * mouse-look. */
function wireTitleCard(ctx, root, state) {
  root.querySelector('#mc-compass-track').innerHTML = compassLabels();
  root.querySelector('#mc-title-click').textContent = isTouchPrimary() ? 'TAP TO EXPLORE' : 'CLICK TO WALK';

  const card = root.querySelector('#mc-title-card');
  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    state.titleFaded = true;
    card.classList.add('mc-faded');
    setTimeout(() => { card.style.display = 'none'; }, 1300);
    root.querySelector('#mc-hud').classList.remove('mc-hidden');
    root.querySelector('#mc-touch-controls').classList.remove('mc-hidden');
    state.hudVisible = true;
    // Optional upgrade only — dismissal above already happened regardless.
    try {
      if (ctx.controls && ctx.controls.controls) ctx.controls.controls.lock();
    } catch (_) { /* denied/unavailable — drag-to-look + joystick fallback already wired */ }
  }
  card.addEventListener('click', dismiss);
  card.addEventListener('touchend', (e) => { e.preventDefault(); dismiss(); }, { passive: false });

  // The on-screen fallback controls are only needed while pointer lock isn't
  // held; hide them on desktop the moment real pointer lock engages, and
  // bring them back if it's ever released (Escape, tab blur, etc).
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    root.querySelector('#mc-touch-controls').classList.toggle('mc-hidden', locked || !state.hudVisible);
  });
}

// --- Keyboard: E to read, M to map, Escape to close -----------------------
// Returns the handler pair so the on-screen tap buttons (wireTouchControls)
// trigger the exact same logic instead of duplicating it.
function wireKeys(ctx, root, state) {
  function handleRead() {
    if (state.openReadable) closeReadable(root, state);
    else if (state.nearestReadable) openReadable(root, state, state.nearestReadable);
  }
  function handleToggleMap() {
    toggleMap(ctx, root, state);
  }
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') handleRead();
    else if (e.code === 'KeyM') handleToggleMap();
    else if (e.code === 'Escape') {
      if (state.openReadable) closeReadable(root, state);
      if (state.mapOpen) toggleMap(ctx, root, state, false);
    }
  });
  return { handleRead, handleToggleMap };
}

// --- Modal tap-to-close: readable panel and map backdrop -------------------
// Keyboard already has Escape; touch has no equivalent, so tapping the paper
// (anywhere) closes the readable, and tapping outside the map frame closes
// the map — both standard mobile-modal conventions.
function wireModalDismiss(ctx, root, state) {
  const panel = root.querySelector('#mc-readable-panel');
  panel.addEventListener('click', () => { if (state.openReadable) closeReadable(root, state); });

  const mapOverlay = root.querySelector('#mc-map-overlay');
  mapOverlay.addEventListener('click', (e) => {
    if (e.target === mapOverlay) toggleMap(ctx, root, state, false);
  });
}

// --- Touch/soft controls: left-bottom joystick + E/M tap buttons ----------
// Understated, deco-styled fallback for anyone without a keyboard (or a
// mouse willing to grant pointer lock): the joystick feeds
// ctx.controls.setVirtualMove(x, z) exactly like WASD would, and the two tap
// buttons dispatch the same handlers KeyE/KeyM already use.
function wireTouchControls(ctx, root, state, keyHandlers) {
  const readBtn = root.querySelector('#mc-touch-read-btn');
  const mapBtn = root.querySelector('#mc-touch-map-btn');
  readBtn.addEventListener('click', (e) => { e.preventDefault(); keyHandlers.handleRead(); });
  mapBtn.addEventListener('click', (e) => { e.preventDefault(); keyHandlers.handleToggleMap(); });

  const base = root.querySelector('#mc-joystick');
  const knob = root.querySelector('#mc-joystick-knob');
  const RADIUS = 34; // px — matches .mc-joystick-base's on-screen radius
  let activePointerId = null;
  let centerX = 0;
  let centerY = 0;

  function moveKnob(dx, dy) {
    knob.style.transform = `translate(calc(-50% + ${(dx * RADIUS).toFixed(1)}px), calc(-50% + ${(dy * RADIUS).toFixed(1)}px))`;
  }
  function updateFromEvent(e) {
    let dx = (e.clientX - centerX) / RADIUS;
    let dy = (e.clientY - centerY) / RADIUS;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    moveKnob(dx, dy);
    // x = strafe (matches KeyD positive), y = forward/back (matches KeyW negative).
    if (ctx.controls && ctx.controls.setVirtualMove) ctx.controls.setVirtualMove(dx, dy);
  }
  function endDrag(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    moveKnob(0, 0);
    if (ctx.controls && ctx.controls.setVirtualMove) ctx.controls.setVirtualMove(0, 0);
  }
  base.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    try { base.setPointerCapture(e.pointerId); } catch (_) { /* older browsers — drag still works */ }
    const rect = base.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    updateFromEvent(e);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    updateFromEvent(e);
  });
  base.addEventListener('pointerup', endDrag);
  base.addEventListener('pointercancel', endDrag);
}

function toggleMap(ctx, root, state, force) {
  const overlay = root.querySelector('#mc-map-overlay');
  const next = force !== undefined ? force : !state.mapOpen;
  state.mapOpen = next;
  overlay.classList.toggle('mc-hidden', !next);
}

function openReadable(root, state, readable) {
  state.openReadable = readable;
  const panel = root.querySelector('#mc-readable-panel');
  const masthead = detectMasthead(readable.title, readable.body);
  const mastheadEl = root.querySelector('#mc-readable-masthead');
  if (masthead) {
    root.querySelector('#mc-masthead-name').textContent = masthead.name;
    root.querySelector('#mc-masthead-sub').textContent = masthead.sub;
    mastheadEl.classList.remove('mc-hidden');
    panel.classList.add('mc-masthead-mode');
  } else {
    mastheadEl.classList.add('mc-hidden');
    panel.classList.remove('mc-masthead-mode');
  }
  root.querySelector('#mc-readable-title').textContent = readable.title;
  root.querySelector('#mc-readable-body').textContent = readable.body;
  panel.classList.remove('mc-hidden');
  root.querySelector('#mc-read-prompt').classList.add('mc-hidden');
  root.querySelector('#mc-touch-read-btn').classList.add('mc-hidden');
}

function closeReadable(root, state) {
  state.openReadable = null;
  root.querySelector('#mc-readable-panel').classList.add('mc-hidden');
}

// --- Per-tick updates -------------------------------------------------------
/** Updates the compass ribbon transform and (on change) the district name;
 * returns the current bearing in degrees (0 = north, clockwise). */
function updateCompassAndDistrict(ctx, root, state, forward) {
  ctx.camera.getWorldDirection(forward);
  let bearing = (Math.atan2(forward.x, -forward.z) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  root.querySelector('#mc-compass-track').style.transform = `translateX(${(-bearing * 4).toFixed(1)}px)`;

  const d = findDistrict(ctx.plan.districts, ctx.camera.position.x, ctx.camera.position.z);
  const slug = d ? d.slug : null;
  if (slug !== state.currentDistrictSlug) {
    state.currentDistrictSlug = slug;
    root.querySelector('#mc-district-name').textContent = d ? d.name.toUpperCase() : 'OUTSKIRTS OF THE MAGIC CITY';
  }
  return bearing;
}

function updateNearestReadable(ctx, root, state, scratch) {
  let nearest = null;
  let nearestDist = READ_RADIUS;
  for (const it of ctx.interactives) {
    it.object.getWorldPosition(scratch);
    const dist = scratch.distanceTo(ctx.camera.position);
    if (dist < nearestDist) { nearestDist = dist; nearest = it; }
  }
  state.nearestReadable = nearest;
  const show = !!nearest && !state.openReadable;
  root.querySelector('#mc-read-prompt').classList.toggle('mc-hidden', !show);
  root.querySelector('#mc-touch-read-btn').classList.toggle('mc-hidden', !show);
}

function updateMapMarker(ctx, root, bearingDeg) {
  const marker = root.querySelector('#mc-map-marker');
  const p = worldToMap(ctx.plan.bounds, MAP_SIZE, ctx.camera.position.x, ctx.camera.position.z);
  marker.style.transform = `translate(${(p.x - 7).toFixed(1)}px, ${(p.y - 7).toFixed(1)}px) rotate(${bearingDeg.toFixed(1)}deg)`;
}
