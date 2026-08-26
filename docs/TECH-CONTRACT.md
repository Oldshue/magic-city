# Magic City 1929 — Tech Contract v1

The technical law of this repository. Every agent honors it exactly.

## Delivery
- Static site, no build step, no network requests at runtime, no external fonts or CDNs.
- `index.html` is the only page. It declares this import map and loads `src/main.js` as a module:
```html
<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js","three/addons/controls/PointerLockControls.js":"./vendor/PointerLockControls.js"}}</script>
```
- three.js r168 lives in `vendor/` (already committed). Import as `import * as THREE from 'three'`.

## Hermetic module graph
Everything reachable by import (directly or transitively) from `<script type="module" src="./src/main.js">` must be hermetic: it must never reference the browsing-context root objects — bare `window`, `location`, `history`, `top`, `parent`, `globalThis` — as identifiers anywhere in its source. This lets the whole city render standalone inside a sandboxed, network-blocked artifact preview whose static capability gate refuses any module in that graph touching those roots.

Allowed, canvas/document-scoped alternatives:
- Sizing: read the canvas/container's own `clientWidth`/`clientHeight` and use a `ResizeObserver` on that element — never `window.innerWidth`/`innerHeight` or a `window` `resize` listener. `src/engine/renderer.js` does this.
- Events: attach listeners to `document` or to specific elements — never to `window`. `document.addEventListener('keydown'/'resize'-equivalent/...)` is fine.
- DOM/feature detection: `document.createElement`, `document.documentElement`, plain global identifiers such as `matchMedia`, `navigator`, `devicePixelRatio`, `requestAnimationFrame`, `AudioContext` are fine — they resolve as ordinary globals without going through a browsing-context root object.
- Nothing in the main graph reads the page's URL (`location.search`, etc.) or writes a global (`window.__MC = ...`).

`src/dev-hooks.js` is the one deliberate exception (see "Verification hooks" below): it is loaded by its own separate `<script type="module" src="./src/dev-hooks.js">` tag, outside the `src/main.js` graph, specifically so it can use `location`/`window` for developer convenience. A hermetic preview environment may omit that one bundle (with a warning) and the world still boots and plays perfectly without it.

## Coordinates
- Units are meters. +X = east, +Z = south, Y = up. Origin (0,0) = the Heaviest Corner (20th Street & 1st Avenue North).
- The player walks at eye height 1.7m.

## data/city-plan.json (written by the City Planner; engine and districts read it)
```json
{
 "meta": {"name": "Magic City 1929", "units": "meters", "origin": "Heaviest Corner"},
 "bounds": {"minX": -1200, "maxX": 1200, "minZ": -1200, "maxZ": 1200},
 "spawn": {"position": [0, 0], "yawDeg": 0},
 "districts": [{"slug": "kebab-case", "name": "...", "polygon": [[x,z]], "character": "one line", "ambience": "one line"}],
 "streets": [{"name": "...", "class": "avenue|street|alley", "width": 18, "path": [[x,z],[x,z]]}],
 "landmarks": [{"id": "kebab-case", "name": "...", "district": "slug", "position": [x,z], "rotationYDeg": 0, "footprint": [w,d], "height": 120, "kind": "tower|station|furnace|statue|theater|block", "real": true, "description": "one line"}],
 "streetcarLines": [{"name": "...", "color": "#RRGGBB", "path": [[x,z]], "loop": true}]
}
```

## Module contracts
- `src/main.js` boots the engine, fetches `data/city-plan.json`, then for each district attempts `await import('./districts/' + district.slug + '.js')` inside try/catch — a missing module logs a warn and is skipped. District agents therefore only ever add their own file; nobody edits shared files to register. Boot uses only built-in defaults (the plan's own spawn point, a live running clock) — it never reads the page's URL. Once boot completes, `src/main.js` dispatches a bubbling `"magic-city:ready"` `CustomEvent` (`bubbles: true, composed: true`) from the renderer's canvas element, whose `detail` carries the dev api described under "Verification hooks" below.
- District module: `export async function build(ctx)` with `ctx = { THREE, scene, plan, district, materials, deco, registerInteractive }`. Build only within your district polygon. `registerInteractive(object3d, { title, body })` makes a thing readable when the player walks close and presses E.
- Systems: `src/systems/index.js` exports `startSystems(ctx)` → returns `{ update(dt, elapsed) }`, called every frame. ctx additionally has `getDayPhase()` (0..1, 0=midnight).
- Narrative: `src/narrative/index.js` exports `initNarrative(ctx)` — owns HTML/CSS overlays (title card, HUD, map, readables panel) and may call `registerInteractive` handlers.
- `src/engine/materials.js` exports named shared materials, at minimum: limestone, brick, terracotta, bronze, steelDark, glassDay, glassNight, marquee, furnaceGlow, asphalt, sidewalk, rail, foliage.
- `src/engine/deco.js` exports art deco geometry helpers, at minimum: `setbackTower(opts)`, `corniceBox(opts)`, `pilasterFacade(opts)`, `finial(opts)`, `windowGrid(opts)` (instanced), `canvasSign(text, opts)` (canvas-texture signage), `streetlamp()`, `decoDoorway(opts)`. Document each signature with a JSDoc block; district agents rely on them.

## Performance
- 60fps target on an ordinary laptop: InstancedMesh for windows, lamps, cars, crowd; merged geometry per building where possible; fog to bound draw distance; no allocations inside the frame loop; total draw calls under ~600.

## Look
- Day-night cycle of 6 real minutes. Warm limestone daylight; at night, lit windows (glassNight emissive), marquee glow, and the furnace district burning orange on the southern horizon. Art deco means: vertical thrust, stepped setbacks, ziggurat crowns, sunburst and chevron ornament, bronze and terra cotta, uplit crowns at night.

## Verification hooks
The hermetic `src/main.js` graph boots from pure built-in defaults and exposes a small **dev api** rather than reading the URL directly. Once boot completes, it dispatches a bubbling `"magic-city:ready"` `CustomEvent` from the renderer's canvas element:
```js
canvas.dispatchEvent(new CustomEvent('magic-city:ready', {
  bubbles: true, composed: true,
  detail: { scene, camera, plan, getDayPhase, setPhase, setSpawn, setFly, setWeather, drawCalls },
}));
```
Each `detail` function is a real hook into the running systems (phase pinning in the sky's frame loop, spawn/teleport via `controls.setSpawn`, fly-speed toggling, `weather.setState(...)`), not a stub.

`src/dev-hooks.js` — loaded by its own separate `<script type="module" src="./src/dev-hooks.js">` tag at the end of `index.html`'s body, deliberately outside the hermetic `src/main.js` graph — listens once for `"magic-city:ready"` and applies the same query parameters as before through that api:

- `?phase=0.42` — calls `setPhase(0.42)`, pinning the day-night cycle phase (0..1). Every frame, the elapsed time fed to the sky system is forced to `phase * 360` (the cycle is 360 seconds) instead of the running clock, so `getDayPhase()` and lighting hold steady at the requested phase.
- `?pos=x,z&yaw=deg` — calls `setSpawn(x, z, yaw)`, overriding the plan's spawn position and yaw. `pos` takes two comma-separated meters (world X,Z); `yaw` takes degrees. Either may be supplied independently; unsupplied values fall back to `plan.spawn`.
- `?fly=1` — calls `setFly(true)`, multiplying movement speed 6x and enabling two additional keys, both handled entirely in `src/main.js`: `R` moves the camera up, `F` moves it down. Fly mode never drops the camera below ground level.
- `?weather=rain` (or `overcast`/`clearing`/`clear`) — calls `setWeather(state)`, pinning the weather state machine in `src/systems/weather.js` to that state.
- `window.__MC` — set by `src/dev-hooks.js` (not by the hermetic graph) once boot completes, for console debugging: the same dev api object described above, `{ scene, camera, plan, getDayPhase, setPhase, setSpawn, setFly, setWeather, drawCalls }`, where `drawCalls()` returns `renderer.info.render.calls` at call time.

**Hermetic rule:** nothing in the `src/main.js` graph may reference `window`/`location`/`history`/`top`/`parent`/`globalThis`. A hermetic preview may omit `src/dev-hooks.js` (with a warning) — the world still boots and is fully playable with pure built-in defaults; only these URL conveniences are unavailable.
