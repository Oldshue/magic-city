import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial, Scene, Group } from '../vendor/three.module.min.js';
import { addPavementApron, addStreetSurfaces, createStreetContact, getStreetSegments, sidewalkRibbons } from '../src/engine/street-layout.js';

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


test('a rolling tire climbs the rendered curb and stays down through a clipped junction', () => {
  const scene = new Scene();
  const material = new MeshBasicMaterial();
  const segments = getStreetSegments([
    {path:[[0, -25], [0, 25]], width:12},
    {path:[[-25, 0], [25, 0]], width:8},
  ]);
  addStreetSurfaces(scene, segments, {asphalt: material, sidewalk: material});
  const apron = new Group();
  addPavementApron(apron, [], material, {minX:9, maxX:11, minZ:9, maxZ:11});
  apron.position.x = 1;
  scene.add(apron);

  const radius = 0.385;
  const contact = createStreetContact(scene, radius, 0.042);
  const perpendicular = Math.PI / 2;
  const nearCurb = 0.16 + Math.sqrt(radius ** 2 - 0.19 ** 2) - radius;
  assert.ok(Math.abs(contact(5.81, 10, perpendicular) - nearCurb) < 1e-6);
  assert.ok(Math.abs(contact(5.81, 10, 0) - 0.02) < 1e-6);
  assert.ok(Math.abs(contact(6.21, 10, perpendicular) - 0.16) < 1e-6);
  assert.ok(Math.abs(contact(6.21, 0, perpendicular) - 0.02) < 1e-6);
  assert.ok(Math.abs(contact(11.5, 10, perpendicular) - 0.16) < 1e-6);
  assert.equal(contact(14, 10, perpendicular), 0);
});
