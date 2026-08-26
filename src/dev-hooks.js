/**
 * dev-hooks.js — optional developer/verification conveniences for Magic
 * City 1929.
 *
 * Loaded by its OWN separate <script type="module" src="./src/dev-hooks.js">
 * tag at the end of index.html's body — deliberately NOT part of the main
 * src/main.js module graph, and deliberately non-hermetic: it reads the
 * page's own address bar query string, something the main graph is
 * forbidden from touching (see docs/TECH-CONTRACT.md "Hermetic module
 * graph" / "Verification hooks"). Hermetic preview environments may omit
 * this one bundle entirely (with a warning) — the world still boots and
 * plays perfectly without it; this file only wires up old query-parameter
 * conveniences for people testing locally with a real address bar.
 *
 * Listens once for the bubbling "magic-city:ready" CustomEvent dispatched
 * from the renderer's canvas element (see src/main.js) and, from its
 * `detail` dev api, applies:
 *   ?phase=0.42        -> api.setPhase(0.42)
 *   ?pos=x,z&yaw=deg   -> api.setSpawn(x, z, yaw)
 *   ?fly=1             -> api.setFly(true)
 *   ?weather=rain      -> api.setWeather('rain')
 *
 * Also stashes the dev api globally as `__MC` for console debugging — that
 * assignment belongs here, not in the hermetic graph.
 */
function applyFromQuery(api) {
  const qs = new URLSearchParams(location.search);

  if (qs.has('phase')) {
    const phase = parseFloat(qs.get('phase'));
    if (Number.isFinite(phase)) api.setPhase(phase);
  }

  if (qs.has('pos')) {
    const parts = qs.get('pos').split(',').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      const yaw = qs.has('yaw') ? parseFloat(qs.get('yaw')) : undefined;
      api.setSpawn(parts[0], parts[1], Number.isFinite(yaw) ? yaw : undefined);
    }
  } else if (qs.has('yaw')) {
    const yaw = parseFloat(qs.get('yaw'));
    if (Number.isFinite(yaw) && api.plan && api.plan.spawn) {
      api.setSpawn(api.plan.spawn.position[0], api.plan.spawn.position[1], yaw);
    }
  }

  if (qs.get('fly') === '1') api.setFly(true);

  if (qs.has('weather')) api.setWeather(qs.get('weather'));

  window.__MC = api;
  console.info('[magic-city] dev-hooks: window.__MC ready', api);
}

document.addEventListener('magic-city:ready', (e) => {
  applyFromQuery(e.detail);
}, { once: true });
