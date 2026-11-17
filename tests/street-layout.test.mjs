import test from 'node:test';
import assert from 'node:assert/strict';
import { getStreetSegments, sidewalkRibbons } from '../src/engine/street-layout.js';

function contains(ring, x, z) {
  return ring.every(([ax, az], i) => {
    const [bx, bz] = ring[(i + 1) % ring.length];
    return (bx - ax) * (z - az) - (bz - az) * (x - ax) > 1e-6;
  });
}

function pave(streets, index = 0) {
  const segments = getStreetSegments(streets);
  const rings = sidewalkRibbons(segments[index], segments);
  return (x, z) => rings.some(ring => contains(ring, x, z));
}

test('a cross street cuts both curb ribbons while leaving the walking block paved', () => {
  const paved = pave([
    {path:[[0, -25], [0, 25]], width:12},
    {path:[[-25, 0], [25, 0]], width:8},
  ]);
  assert.equal(paved(8, 0), false);
  assert.equal(paved(-8, 3), false);
  assert.equal(paved(8, 9), true);
  assert.equal(paved(-8, -9), true);
});

test('an angled T junction cuts the approach and keeps the far sidewalk intact', () => {
  const paved = pave([
    {path:[[0, -25], [0, 25]], width:12},
    {path:[[0, 0], [26, 16]], width:10},
  ]);
  assert.equal(paved(7.5, 4.5), false);
  assert.equal(paved(-7.5, 4.5), true);
  assert.equal(paved(7.5, 15), true);
});
