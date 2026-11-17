import test from 'node:test';
import assert from 'node:assert/strict';
import { carFootprintBlocked, clearCameraFraction } from '../src/engine/vehicle-motion.mjs';

const storefront = {minX:18,maxX:42,minZ:14,maxZ:38};

test('the long axis fits along the curb and stops a sedan turning through a facade', () => {
  assert.equal(carFootprintBlocked([storefront], 25, 11.5, Math.PI / 2), false);
  assert.equal(carFootprintBlocked([storefront], 25, 12, 0), true);
  assert.equal(carFootprintBlocked([storefront], 25, 11, 0), false);
});

test('the chase boom shortens before a wall and stays extended on clear streets', () => {
  assert.equal(clearCameraFraction([storefront], 11, 18, 11, 27), 1);
  const t = clearCameraFraction([storefront], 12, 18, 23, 19);
  assert.ok(t > 0.45 && t < 0.54);
  assert.equal(clearCameraFraction([storefront], 12, 18, 6, 18), 1);
});
