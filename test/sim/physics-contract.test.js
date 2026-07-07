import assert from 'node:assert/strict';
import { NullPhysicsWorld } from '../../shared/sim/physics/physics-world.js';
import { test } from './harness.js';

test('NullPhysicsWorld has the full stepper contract', () => {
  const physics = new NullPhysicsWorld();
  for (const method of ['add', 'remove', 'applyControls', 'step', 'drainCollisions']) {
    assert.equal(typeof physics[method], 'function', `missing ${method}`);
  }
});

test('NullPhysicsWorld.drainCollisions() returns an empty array', () => {
  const physics = new NullPhysicsWorld();
  assert.deepEqual(physics.drainCollisions(), []);
});
