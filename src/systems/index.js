/**
 * systems/index.js — the living city. Wires together streetcars, period
 * automobiles, pedestrians, steel-district furnace life, WebAudio ambience,
 * the NOIR JAZZ score, drivable cars/streetcar riding, and noir weather, per
 * docs/TECH-CONTRACT.md:
 *   export async/sync function startSystems(ctx) -> { update(dt, elapsed) }
 * Each subsystem is started defensively — a failure in one never prevents
 * the rest of the living city from running.
 */
import { startStreetcars } from './streetcars.js';
import { startTraffic } from './traffic.js';
import { startPedestrians } from './pedestrians.js';
import { startCrownPatrons } from './crown-patrons.js';
import { startSteelLife } from './steelLife.js';
import { startAmbience } from './ambience.js';
import { startJazz } from './jazz.js';
import { startDriving } from './driving.js';
import { startWeather } from './weather.js';
import { startPolice } from './police.js';

export function startSystems(ctx) {
  const streetcars = safeStart(startStreetcars, ctx, 'streetcars');

  const steelLife = safeStart(startSteelLife, ctx, 'steelLife');
  const ambience = safeStart(startAmbience, ctx, 'ambience');
  const jazz = safeStart(startJazz, ctx, 'jazz');
  // driving.js coordinates streetcar boarding through streetcars.getCars() rather than
  // reaching into streetcars.js internals — ctx is only extended, never mutated upstream.
  const driving = safeStart((c) => startDriving({ ...c, streetcars }), ctx, 'driving');
  const traffic = safeStart((c) => startTraffic({ ...c, driving }), ctx, 'traffic');
  const police = driving ? safeStart((c) => startPolice({ ...c, driving }), ctx, 'police') : null;
  const crownPatrons = safeStart(startCrownPatrons,ctx,'Crown patrons');
  const pedestrians = safeStart((c) => startPedestrians({ ...c, traffic }), ctx, 'pedestrians');
  const weather = safeStart(startWeather, ctx, 'weather');

  const carPositions = streetcars && streetcars.getCarPositions ? streetcars.getCarPositions() : [];
  const ambienceExtra = { carPositions };

  return {
    update(dt, elapsed) {
      if (streetcars) streetcars.update(dt, elapsed);

      if (steelLife) steelLife.update(dt, elapsed, ctx.camera);
      if (ambience) ambience.update(dt, elapsed, ambienceExtra);
      if (jazz) jazz.update(dt, elapsed);
      if (driving) driving.update(dt, elapsed, weather?.rainfall ?? 0);
      if (traffic) traffic.update(dt, elapsed);
      if (police) police.update(dt, elapsed);
      ctx.counterService?.update(dt);
      crownPatrons?.update(dt);
      for (const stand of ctx.newsstands ?? []) stand.update(dt,traffic);
      if (weather) weather.update(dt, elapsed);
      if (pedestrians) pedestrians.update(dt, elapsed, weather?.rainfall ?? 0);
    },
    // Additive beyond the documented { update } contract, same pattern as
    // ctx's own additive `controls` field — src/main.js's dev api hook
    // setWeather(state) calls weather.setState(state) through this
    // reference so the hook is a real wire into the running system.
    weather, police,
  };
}

function safeStart(fn, ctx, label) {
  try {
    return fn(ctx);
  } catch (err) {
    console.warn('[magic-city] systems: ' + label + ' failed to start', err);
    return null;
  }
}
