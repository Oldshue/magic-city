/**
 * districts/test-block.js — placeholder proof-of-engine district.
 * A handful of setback towers around the crossing streets, lit windows,
 * and a canvas marquee reading "MAGIC CITY" over the Heaviest Corner.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { setbackTower, canvasSign, streetlamp, decoDoorway, windowGrid } from '../engine/deco.js';
import { materials } from '../engine/materials.js';

export async function build(ctx) {
  const { scene, plan, materials: M, deco } = ctx;
  const group = new THREE.Group();

  // Landmark towers from the plan.
  for (const lm of plan.landmarks) {
    if (lm.district !== 'test-block') continue;
    const tower = deco.setbackTower({
      width: lm.footprint[0], depth: lm.footprint[1], height: lm.height,
      setbacks: 3,
      material: M.limestone,
      windowMaterial: M.glassNight, // lit windows read at dusk/night
    });
    tower.position.set(lm.position[0], 0, lm.position[1]);
    tower.rotation.y = THREE.MathUtils.degToRad(lm.rotationYDeg);
    group.add(tower);
  }

  // One smaller brick infill block with pilaster rhythm.
  const block = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 14), M.brick);
  body.position.y = 11;
  block.add(body);
  const grid = deco.windowGrid({ rows: 5, cols: 4, spacingX: 3.6, spacingY: 3.6,
    width: 1.5, height: 2.2, material: M.glassNight });
  grid.position.set(0, 12, 7.06);
  block.add(grid);
  const door = deco.decoDoorway({ width: 3.2, height: 4.6 });
  door.position.set(0, 0, 7.1);
  block.add(door);
  block.position.set(40, 0, 30);
  block.rotation.y = -0.35;
  group.add(block);

  // Marquee sign reading "MAGIC CITY" near the Heaviest Corner intersection.
  const sign = deco.canvasSign('MAGIC CITY', { width: 16 });
  sign.position.set(0, 9, 12);
  sign.rotation.y = Math.PI; // face north up 20th Street toward spawn
  group.add(sign);

  // Streetlamps along both streets near the intersection.
  for (const [x, z] of [[-11, -25], [-11, 15], [10, -20], [10, 20], [-25, 9], [25, 9]]) {
    const lamp = deco.streetlamp();
    lamp.position.set(x, 0, z);
    if (x > 8 || x < -8) lamp.rotation.y = Math.PI / 2;
    group.add(lamp);
  }

  // Register the sign as readable.
  ctx.registerInteractive(sign, {
    title: 'MAGIC CITY',
    body: 'Birmingham, Alabama — 1929. The iron city burns bright in an age of steel and limestone.',
  });

  scene.add(group);
}
