import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.js';
import { Entity } from '../../shared/sim/entity.js';
import { test } from './harness.js';

test('spawn assigns reused dense ids', () => {
  const w = new World();
  const a = w.spawn(new Entity({ type: 1 }));
  const b = w.spawn(new Entity({ type: 1 }));
  assert.equal(a.id, 0);
  assert.equal(b.id, 1);
  w.despawn(0);
  const c = w.spawn(new Entity({ type: 1 }));
  assert.equal(c.id, 0); // reuses freed slot
});

test('spawnWithId places an entity at the given id and fires onSpawn', () => {
  const w = new World();
  const spawned: Entity[] = [];
  w.onSpawn = (e) => spawned.push(e);
  const e = w.spawnWithId(42, new Entity({ type: 1 }));
  assert.equal(e.id, 42);
  assert.equal(w.get(42), e);
  assert.deepEqual(spawned, [e]);
  w.despawn(42);
  assert.equal(w.entities.has(42), false);
});

test('tick runs subsystems in registration order', () => {
  const order: string[] = [];
  const w = new World();
  w.addSubsystem({ update: () => order.push('a') });
  w.addSubsystem({ update: () => order.push('b') });
  w.tick(16, 0);
  assert.deepEqual(order, ['a', 'b']);
});

test('tick calls entity.update then reaps destroyed', () => {
  const w = new World();
  const e = w.spawn(new Entity({ type: 1 }));
  e.update = () => e.markDestroyed();
  w.tick(16, 0);
  assert.equal(w.entities.has(e.id!), false);
});

test('tick does not update entities spawned mid-tick', () => {
  const w = new World();
  const parent = w.spawn(new Entity({ type: 1 }));
  let childUpdated = false;
  parent.update = () => {
    const child = w.spawn(new Entity({ type: 1 }));
    child.update = () => {
      childUpdated = true;
    };
  };
  w.tick(16, 0);
  assert.equal(childUpdated, false);
});
