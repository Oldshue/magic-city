/**
 * systems/index.js — the living city. Wires together streetcars, period
 * automobiles, pedestrians, steel-district furnace life, WebAudio ambience,
 * and the NOIR JAZZ score, per docs/TECH-CONTRACT.md:
 *   export async/sync function startSystems(ctx) -> { update(dt, elapsed) }
 * Each subsystem is started defensively — a failure in one never prevents
 * the rest of the living city from running.
 */
import { startStreetcars } from './streetcars.js';
import { startTraffic } from './traffic.js';
import { startPedestrians } from './pedestrians.js';
import { startSteelLife } from './steelLife.js';
import { startAmbience } from './ambience.js';
import { startJazz } from './jazz.js';

export function startSystems(ctx) {
  const streetcars = safeStart(startStreetcars, ctx, 'streetcars');
  const traffic = safeStart(startTraffic, ctx, 'traffic');
  const pedestrians = safeStart(startPedestrians, ctx, 'pedestrians');
  const steelLife = safeStart(startSteelLife, ctx, 'steelLife');
  const ambience = safeStart(startAmbience, ctx, 'ambience');
  const jazz = safeStart(startJazz, ctx, 'jazz');

  const carPositions = streetcars && streetcars.getCarPositions ? streetcars.getCarPositions() : [];
  const ambienceExtra = { carPositions };

  return {
    update(dt, elapsed) {
      if (streetcars) streetcars.update(dt, elapsed);
      if (traffic) traffic.update(dt, elapsed);
      if (pedestrians) pedestrians.update(dt, elapsed);
      if (steelLife) steelLife.update(dt, elapsed, ctx.camera);
      if (ambience) ambience.update(dt, elapsed, ambienceExtra);
      if (jazz) jazz.update(dt, elapsed);
    },
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
