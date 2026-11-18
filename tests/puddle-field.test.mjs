import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPuddleField } from '../src/engine/puddle-field.mjs';

const field = createPuddleField();

test('dry weather and ground beyond the reflective road do not contribute standing water', () => {
  assert.equal(field.sample(9.2,40.5,0),0);
  assert.equal(field.sample(13,40.5,1),0);
  assert.equal(field.sample(9.2,65,1),0);
  assert.equal(field.sample(9.2,-2,1),0);
  assert.ok(field.sample(9.2,40.5,.95)>.9);
});

test('opposite tires can pass through different parts of the same gutter', () => {
  const innerWheel = field.sample(9.3-.707,27,.95);
  const outerWheel = field.sample(9.3+.707,27,.95);
  assert.equal(innerWheel,0);
  assert.ok(outerWheel>.9);
  assert.ok(field.sample(9.3+.707,27,.54)<outerWheel);
});
