import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Entity } from '../../shared/sim/entity.ts';
import { PriorityAccumulator } from '../../shared/sim/net/priority.ts';
import { test } from './harness.ts';

// A budget with effectively no cap: header 0, entity 1 bit, huge budget.
const UNCAPPED = { budgetBits: 1e9, headerBits: 0, entityBits: 1 };

test('first select reports every entity; a second (unchanged) reports none', () => {
  const w = new World();
  w.spawn(new Entity({ type: 1 }));
  w.spawn(new Entity({ type: 1 }));
  const pa = new PriorityAccumulator();
  assert.equal(pa.select(w, UNCAPPED).length, 2);
  assert.equal(pa.select(w, UNCAPPED).length, 0);
});

test('a moved entity is reselected; the baseline tracks the last SENT state', () => {
  const w = new World();
  const e = w.spawn(new Entity({ type: 1 }));
  const pa = new PriorityAccumulator();
  pa.select(w, UNCAPPED);
  e.transform.position.set(5, 0, 0);
  const sel = pa.select(w, UNCAPPED);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].id, e.id);
});

test('the byte budget caps how many entities go out per packet', () => {
  const w = new World();
  for (let i = 0; i < 5; i++) {
    w.spawn(new Entity({ type: 1 }));
  }
  const pa = new PriorityAccumulator();
  // header 0, entity 10 bits, budget 25 bits -> floor(25/10) = 2 fit.
  const sel = pa.select(w, { budgetBits: 25, headerBits: 0, entityBits: 10 });
  assert.equal(sel.length, 2);
});

test('deferred entities accumulate priority and are all delivered within ceil(n/k) packets', () => {
  const w = new World();
  const ids = new Set<number>();
  for (let i = 0; i < 5; i++) {
    ids.add(w.spawn(new Entity({ type: 1 })).id!);
  }
  const pa = new PriorityAccumulator();
  const budget = { budgetBits: 20, headerBits: 0, entityBits: 10 }; // 2 per packet

  const delivered = new Set<number>();
  let packets = 0;
  while (delivered.size < ids.size && packets < 10) {
    const sel = pa.select(w, budget);
    assert.ok(sel.length <= 2, 'never exceeds the budget');
    for (const e of sel) {
      delivered.add(e.id);
    }
    packets++;
  }

  assert.deepEqual([...delivered].sort(), [...ids].sort(), 'all delivered');
  assert.equal(packets, Math.ceil(ids.size / 2)); // 3 packets for 5 objects @ 2/packet
});

test('a sent entity resets to zero, so a fresh change does not jump the queue', () => {
  const w = new World();
  const a = w.spawn(new Entity({ type: 1 }));
  const b = w.spawn(new Entity({ type: 1 }));
  const c = w.spawn(new Entity({ type: 1 }));
  const pa = new PriorityAccumulator();
  const budget = { budgetBits: 10, headerBits: 0, entityBits: 10 }; // 1 per packet

  // Tick 1: a, b, c all new (priority 1). a wins (world order), sent + reset.
  assert.deepEqual(
    pa.select(w, budget).map((e) => e.id),
    [a.id],
  );
  // Tick 2: b, c now at priority 2; a unchanged. b wins.
  assert.deepEqual(
    pa.select(w, budget).map((e) => e.id),
    [b.id],
  );
  // Tick 3: c at priority 3 beats a even if a moves now (a would be priority 1).
  a.transform.position.set(9, 0, 0);
  assert.deepEqual(
    pa.select(w, budget).map((e) => e.id),
    [c.id],
  );
});

test('a non-positive priority culls an entity entirely (interest management)', () => {
  const w = new World();
  const a = w.spawn(new Entity({ type: 1 }));
  const b = w.spawn(new Entity({ type: 1 }));
  const pa = new PriorityAccumulator();
  const cullB = (e: Entity) => (e.id === b.id ? 0 : 1);

  assert.deepEqual(
    pa.select(w, UNCAPPED, cullB).map((e) => e.id),
    [a.id],
  );
  // Even changing + many ticks, a culled entity never enters a packet.
  for (let i = 0; i < 5; i++) {
    b.transform.position.set(i, 0, 0);
    assert.deepEqual(
      pa.select(w, UNCAPPED, cullB).map((e) => e.id),
      [],
    );
  }
});

test('higher priority updates far more often but the low one still gets through', () => {
  const w = new World();
  const near = w.spawn(new Entity({ type: 1 }));
  const far = w.spawn(new Entity({ type: 1 }));
  const pa = new PriorityAccumulator();
  const budget = { budgetBits: 10, headerBits: 0, entityBits: 10 }; // 1 per packet
  const prio = (e: Entity) => (e.id === near.id ? 10 : 1);

  let nearCount = 0;
  let farCount = 0;
  for (let t = 0; t < 12; t++) {
    near.transform.position.set(t + 1, 0, 0); // both change every tick
    far.transform.position.set(0, 0, t + 1);
    for (const e of pa.select(w, budget, prio)) {
      if (e.id === near.id) nearCount++;
      else farCount++;
    }
  }

  assert.ok(nearCount > farCount, 'near updates dominate');
  assert.ok(farCount >= 1, 'far is still eventually delivered (no starvation)');
});

test('despawned entities are pruned and never reselected', () => {
  const w = new World();
  const a = w.spawn(new Entity({ type: 1 }));
  const b = w.spawn(new Entity({ type: 1 }));
  const pa = new PriorityAccumulator();
  pa.select(w, UNCAPPED); // both sent
  w.despawn(a.id!);
  b.transform.position.set(3, 0, 0);
  const sel = pa.select(w, UNCAPPED);
  assert.deepEqual(
    sel.map((e) => e.id),
    [b.id],
  );
});
