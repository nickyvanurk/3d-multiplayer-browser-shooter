import type { Entity } from './entity.ts';

// A collision pair drained from the physics stepper. `a` is the primary body
// (guaranteed present); `b` is the other body. Both are present at runtime
// because every physics body carries its entity back-reference, and the combat
// subsystem reads both unconditionally.
export interface Collision {
  a: Entity;
  b: Entity;
}

// The only surface World exposes onto the injected stepper: the combat
// subsystem drains collisions through `world.physics`. World itself does not
// drive the stepper — the host (server game loop) calls add/remove/step on its
// own physics reference. Task 5 defines the full stepper contract.
export interface PhysicsWorld {
  drainCollisions(): Collision[];
}

export interface Subsystem {
  update(world: World, dt: number, time: number): void;
}

export class World {
  entities: Map<number, Entity>;
  subsystems: Subsystem[];
  _slots: (Entity | undefined)[];
  physics!: PhysicsWorld; // injected by the host after construction
  onSpawn: ((entity: Entity) => void) | null;
  onDespawn: ((entity: Entity) => void) | null;

  constructor() {
    this.entities = new Map();
    this.subsystems = [];
    this._slots = []; // dense id -> Entity | undefined (mirrors old scheme)
    this.onSpawn = null; // hooks the network/presentation layers subscribe to
    this.onDespawn = null;
  }

  addSubsystem(s: Subsystem): this {
    this.subsystems.push(s);
    return this;
  }

  spawn<T extends Entity>(entity: T): T {
    let id = this._slots.findIndex((x) => x === undefined);
    if (id === -1) {
      id = this._slots.length;
    }
    this._slots[id] = entity;
    entity.id = id;
    this.entities.set(id, entity);
    if (this.onSpawn) {
      this.onSpawn(entity);
    }
    return entity;
  }

  // Place an entity at a caller-supplied id (the client mirrors server-owned
  // ids). The server uses dense-id spawn(); the client owns no id allocation.
  spawnWithId<T extends Entity>(id: number, entity: T): T {
    entity.id = id;
    this._slots[id] = entity;
    this.entities.set(id, entity);
    if (this.onSpawn) {
      this.onSpawn(entity);
    }
    return entity;
  }

  despawn(id: number): void {
    const entity = this.entities.get(id);
    if (!entity) {
      return;
    }
    this.entities.delete(id);
    this._slots[id] = undefined;
    if (this.onDespawn) {
      this.onDespawn(entity);
    }
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  tick(dt: number, time: number): void {
    for (const e of [...this.entities.values()]) {
      e.update(dt, this, time);
    }
    for (const s of this.subsystems) {
      s.update(this, dt, time);
    }
    this.reap();
  }

  reap(): void {
    for (const e of [...this.entities.values()]) {
      if (e.destroyed) {
        this.despawn(e.id!);
      }
    }
  }
}
