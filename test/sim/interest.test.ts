import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { World } from '../../shared/sim/world.ts';
import { Entity } from '../../shared/sim/entity.ts';
import { PriorityAccumulator } from '../../shared/sim/net/priority.ts';
import { viewerPriority } from '../../server/src/net/network-server.ts';
import { test } from './harness.ts';

const UNCAPPED = { budgetBits: 1e9, headerBits: 0, entityBits: 1 };

function at(x: number, z = 0): Entity {
  return new Entity({ type: 1, transform: { position: new Vector3(x, 0, z) } });
}

test('viewerPriority never returns a culling priority, however distant', () => {
  const self = at(0);
  const prio = viewerPriority(self);
  for (const distance of [0, 100, 2999, 3000, 3001, 10_000, 1e6]) {
    assert.ok(
      prio(at(distance)) > 0,
      `distance ${distance} must stay a candidate (got ${prio(at(distance))})`,
    );
  }
});

test('a distant entity is still delivered (client dead-reckons it otherwise)', () => {
  const w = new World();
  const self = w.spawn(at(0));
  const far = w.spawn(at(50_000));
  const pa = new PriorityAccumulator();
  const prio = viewerPriority(self);

  // The vendor case: far away, moving every tick, uncontended bandwidth.
  let delivered = false;
  for (let t = 0; t < 5 && !delivered; t++) {
    far.transform.position.set(50_000 + t, 0, 0);
    delivered = pa.select(w, UNCAPPED, prio).some((e) => e.id === far.id);
  }
  assert.ok(delivered, 'a distant entity must reach the client');
});

test('a distant entity gets through even when near traffic saturates the budget', () => {
  const w = new World();
  const self = w.spawn(at(0));
  const far = w.spawn(at(50_000));
  // Enough nearby movers to fill every packet on their own.
  const near = [at(10), at(20), at(30)].map((e) => w.spawn(e));
  const pa = new PriorityAccumulator();
  const prio = viewerPriority(self);
  const budget = { budgetBits: 10, headerBits: 0, entityBits: 10 }; // 1 per packet

  let farCount = 0;
  let nearCount = 0;
  for (let t = 1; t <= 600; t++) {
    for (const e of near)
      e.transform.position.set(e.transform.position.x, t, 0);
    far.transform.position.set(50_000 + t, 0, 0);
    for (const e of pa.select(w, budget, prio)) {
      if (e.id === far.id) farCount++;
      else if (near.some((n) => n.id === e.id)) nearCount++;
    }
  }

  assert.ok(farCount >= 1, 'the far entity is never starved out entirely');
  assert.ok(nearCount > farCount, 'near traffic still dominates the budget');
});

test('nearer entities keep a higher priority than farther ones', () => {
  const prio = viewerPriority(at(0));
  const near = prio(at(100));
  const mid = prio(at(2000));
  const far = prio(at(9000));
  assert.ok(near > mid, 'near outranks mid');
  assert.ok(mid > far, 'mid outranks far');
});
