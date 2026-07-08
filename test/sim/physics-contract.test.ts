import assert from 'node:assert/strict';
import { NullPhysicsWorld } from '../../shared/sim/physics/physics-world.ts';
import { test } from './harness.ts';

test('NullPhysicsWorld has the full stepper contract', () => {
  const physics = new NullPhysicsWorld();
  for (const method of [
    'add',
    'remove',
    'applyControls',
    'step',
    'drainCollisions',
  ] as const) {
    assert.equal(typeof physics[method], 'function', `missing ${method}`);
  }
});

test('NullPhysicsWorld.drainCollisions() returns an empty array', () => {
  const physics = new NullPhysicsWorld();
  assert.deepEqual(physics.drainCollisions(), []);
});
