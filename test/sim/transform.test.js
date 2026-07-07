// test/sim/transform.test.js
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Transform } from '../../shared/sim/transform.js';
import { test } from './harness.js';

test('Transform defaults to origin, identity, scale 1', () => {
  const t = new Transform();
  assert.deepEqual(t.position.toArray(), [0, 0, 0]);
  assert.equal(t.scale, 1);
});

test('Transform.copy overwrites without aliasing', () => {
  const a = new Transform({ position: new Vector3(1, 2, 3) });
  const b = new Transform();
  b.copy(a);
  a.position.x = 9;
  assert.equal(b.position.x, 1);
});
