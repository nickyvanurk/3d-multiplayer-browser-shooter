import assert from 'node:assert/strict';
import { Entity } from '../../shared/sim/entity.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { test } from './harness.ts';

test('Entity serialize round-trips transform', () => {
  const e = new Entity({ id: 4, type: 1 });
  e.transform.position.set(1, 2, 3);
  const clone = new Entity({ id: 4, type: 1 });
  clone.applyNetworkState(e.serializeNetworkState());
  assert.deepEqual(clone.transform.position.toArray(), [1, 2, 3]);
});

test('Ship replicates health and level in network slots [14] and [15]', () => {
  const ship = new Ship({ id: 7 });
  ship.health = 63;
  ship.level = 4;
  const state = ship.serializeNetworkState();
  assert.equal(state.length, 16);
  assert.equal(state[14], 63);
  assert.equal(state[15], 4);
});

test('Entity.markDestroyed sets flag', () => {
  const e = new Entity({ id: 1, type: 1 });
  assert.equal(e.destroyed, false);
  e.markDestroyed();
  assert.equal(e.destroyed, true);
});
