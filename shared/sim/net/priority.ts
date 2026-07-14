import type { World } from '../world.ts';
import type { Entity } from '../entity.ts';
import { quantizeState } from './quantize.ts';

export interface PriorityEntry {
  id: number;
  state: number[];
}

export interface SnapshotBudget {
  budgetBits: number;
  headerBits: number;
  entityBits: number;
}

// Per-object priority for this snapshot. Return > 0 to weight the object (larger
// = sooner). Returning <= 0 culls it: not deferred, but dropped from every packet
// for as long as the priority stays <= 0.
//
// Culling is almost never what you want. The accumulator's guarantee is eventual
// delivery, and a cull is the one way to forfeit it — clients dead-reckon remote
// bodies on their last known velocity, so a culled object doesn't freeze, it
// coasts in a straight line forever. Prefer a small positive priority (rare
// updates) over 0 (silence); let the bandwidth budget do the rationing. Reserve 0
// for objects the client genuinely must not know about at all.
export type PriorityFn = (entity: Entity) => number;

// Fiedler's priority accumulator. Each snapshot, every changed object's priority
// is added to a per-object accumulator; objects are then sorted by accumulator
// (largest first) and packed into the packet up to the bandwidth budget. Objects
// that fit reset their accumulator to zero; objects that don't keep theirs, so
// they are first in line next time — giving eventual delivery and fairness under
// a fixed bandwidth cap. Change detection keys on the quantized state, so an
// unchanged object never competes for bandwidth.
export class PriorityAccumulator {
  // id -> last SENT quantized-state key. An object is a candidate whenever its
  // current key differs from this. Updated only when the object is actually
  // included in a packet, so a deferred change stays pending until it goes out.
  private baseline: Map<number, string>;
  private accumulator: Map<number, number>;

  constructor() {
    this.baseline = new Map();
    this.accumulator = new Map();
  }

  select(
    world: World,
    budget: SnapshotBudget,
    priorityOf: PriorityFn = () => 1,
  ): PriorityEntry[] {
    const candidates: { id: number; state: number[]; key: string }[] = [];
    const seen = new Set<number>();

    for (const entity of world.entities.values()) {
      seen.add(entity.id!);
      if (entity.alive === false) {
        continue; // dead entities are handled by Despawn, not snapshots
      }
      const priority = priorityOf(entity);
      if (priority <= 0) {
        continue; // outside this viewer's interest — cull (keeps its baseline)
      }
      const state = quantizeState(entity.serializeNetworkState());
      const key = state.join(',');
      if (this.baseline.get(entity.id!) === key) {
        continue; // unchanged since last send — nothing to transmit
      }
      this.accumulator.set(
        entity.id!,
        (this.accumulator.get(entity.id!) ?? 0) + priority,
      );
      candidates.push({ id: entity.id!, state, key });
    }

    this.prune(seen);

    candidates.sort(
      (a, b) =>
        (this.accumulator.get(b.id) ?? 0) - (this.accumulator.get(a.id) ?? 0),
    );

    const out: PriorityEntry[] = [];
    let bits = budget.headerBits;
    for (const candidate of candidates) {
      if (bits + budget.entityBits > budget.budgetBits) {
        continue; // won't fit this packet; leave its accumulator to grow
      }
      bits += budget.entityBits;
      out.push({ id: candidate.id, state: candidate.state });
      this.baseline.set(candidate.id, candidate.key);
      this.accumulator.set(candidate.id, 0);
    }
    return out;
  }

  private prune(seen: Set<number>): void {
    for (const id of this.baseline.keys()) {
      if (!seen.has(id)) {
        this.baseline.delete(id);
      }
    }
    for (const id of this.accumulator.keys()) {
      if (!seen.has(id)) {
        this.accumulator.delete(id);
      }
    }
  }
}
