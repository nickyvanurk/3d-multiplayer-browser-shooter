import type { World } from '../world.ts';

// One changed entity emitted by the differ: its id plus its network state (16
// numbers: transform + velocities, then the packed input, health and level).
// Mirrors the Messages.World wire layout. The differ itself is length-agnostic.
interface SnapshotEntry {
  id: number;
  state: number[];
}

export class SnapshotDiffer {
  last: Map<number, string>;

  constructor() {
    this.last = new Map();
  } // id -> "px,py,pz,rx,ry,rz,rw"

  changed(world: World): SnapshotEntry[] {
    const out: SnapshotEntry[] = [];
    const seen = new Set<number>();
    for (const e of world.entities.values()) {
      seen.add(e.id!);
      const state = e.serializeNetworkState();
      const key = state.join(',');
      if (this.last.get(e.id!) !== key) {
        out.push({ id: e.id!, state });
        this.last.set(e.id!, key);
      }
    }
    for (const id of this.last.keys()) {
      if (!seen.has(id)) {
        this.last.delete(id);
      }
    }
    return out;
  }
}
