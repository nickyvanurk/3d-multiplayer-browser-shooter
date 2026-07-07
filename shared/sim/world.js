export class World {
  constructor() {
    this.entities = new Map();
    this.subsystems = [];
    this._slots = [];            // dense id -> Entity | undefined (mirrors old scheme)
    this.onSpawn = null;         // hooks the network/presentation layers subscribe to
    this.onDespawn = null;
  }

  addSubsystem(s) { this.subsystems.push(s); return this; }

  spawn(entity) {
    let id = this._slots.findIndex((x) => x === undefined);
    if (id === -1) {id = this._slots.length;}
    this._slots[id] = entity;
    entity.id = id;
    this.entities.set(id, entity);
    if (this.onSpawn) {this.onSpawn(entity);}
    return entity;
  }

  // Place an entity at a caller-supplied id (the client mirrors server-owned
  // ids). The server uses dense-id spawn(); the client owns no id allocation.
  spawnWithId(id, entity) {
    entity.id = id;
    this._slots[id] = entity;
    this.entities.set(id, entity);
    if (this.onSpawn) {this.onSpawn(entity);}
    return entity;
  }

  despawn(id) {
    const entity = this.entities.get(id);
    if (!entity) {return;}
    this.entities.delete(id);
    this._slots[id] = undefined;
    if (this.onDespawn) {this.onDespawn(entity);}
  }

  get(id) { return this.entities.get(id); }

  tick(dt, time) {
    for (const e of [...this.entities.values()]) {e.update(dt, this, time);}
    for (const s of this.subsystems) {s.update(this, dt, time);}
    this.reap();
  }

  reap() {
    for (const e of [...this.entities.values()]) {
      if (e.destroyed) {this.despawn(e.id);}
    }
  }
}
