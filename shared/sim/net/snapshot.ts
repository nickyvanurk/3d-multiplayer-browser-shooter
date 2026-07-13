import type { World } from '../world.ts';
import { quantizeState } from './quantize.ts';

// One changed entity emitted by the differ: its id plus its QUANTIZED network
// state (16 integer buckets produced by quantizeState). Change detection keys on
// the quantized values, so a nudge smaller than one grid cell no longer counts as
// a change and drops off the wire. Mirrors the Messages.World wire layout.
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
      const state = quantizeState(e.serializeNetworkState());
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
