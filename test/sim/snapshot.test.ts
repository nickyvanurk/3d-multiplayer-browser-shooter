import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Entity } from '../../shared/sim/entity.ts';
import { SnapshotDiffer } from '../../shared/sim/net/snapshot.ts';
import { test } from './harness.ts';

test('first diff reports all entities; second reports none', () => {
  const w = new World();
  w.spawn(new Entity({ type: 1 }));
  const d = new SnapshotDiffer();
  assert.equal(d.changed(w).length, 1);
  assert.equal(d.changed(w).length, 0); // nothing moved
});

test('moving an entity makes it appear in the diff', () => {
  const w = new World();
  const e = w.spawn(new Entity({ type: 1 }));
  const d = new SnapshotDiffer();
  d.changed(w);
  e.transform.position.set(5, 0, 0);
  const changed = d.changed(w);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, e.id);
});
