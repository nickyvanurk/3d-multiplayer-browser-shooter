export class SnapshotDiffer {
  constructor() { this.last = new Map(); }   // id -> "px,py,pz,rx,ry,rz,rw"

  changed(world) {
    const out = [];
    const seen = new Set();
    for (const e of world.entities.values()) {
      seen.add(e.id);
      const state = e.serializeNetworkState();
      const key = state.join(',');
      if (this.last.get(e.id) !== key) {
        out.push({ id: e.id, state });
        this.last.set(e.id, key);
      }
    }
    for (const id of this.last.keys()) {if (!seen.has(id)) {this.last.delete(id);}}
    return out;
  }
}
