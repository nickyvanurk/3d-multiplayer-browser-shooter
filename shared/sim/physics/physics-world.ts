import type { Entity } from '../entity.js';
import type { World } from '../world.js';

// A collision pair drained from the physics stepper. Both bodies are present at
// runtime: every world body is added via `add()`, which sets `body.entity`, so
// there are no entity-less bodies. `b` is non-nullable and the combat subsystem
// reads it unconditionally.
export interface Collision {
  a: Entity;
  b: Entity;
}

// Contract: a physics stepper the World drives. Server injects a Rapier-backed
// implementation; the client injects a no-op today (interpolation only) and the
// real stepper later for prediction.
//
// `init`/`add`/`remove`/`step`/`drainCollisions` are the members the host drives
// on every stepper (the host calls `init()` unconditionally at startup), so they
// are required. The impl-specific hooks are optional: `applyControls` integrates
// a single body (Null only), and `applyAll` applies controls/forces across the
// world before stepping (Rapier only). NOTE: an injected stepper that omits
// `applyAll` will silently apply no forces — a prediction stepper must
// implement it.
export interface PhysicsWorld {
  init(): Promise<void>;
  add(entity: Entity): void;
  remove(entity: Entity): void;
  step(dt: number): void;
  drainCollisions(): Collision[];
  applyControls?(entity: Entity, dt: number): void;
  applyAll?(world: World, dt: number): void;
}

export class NullPhysicsWorld implements PhysicsWorld {
  async init(): Promise<void> {}
  add(_entity: Entity): void {}
  remove(_entity: Entity): void {}
  applyControls(_entity: Entity, _dt: number): void {}
  step(_dt: number): void {}
  drainCollisions(): Collision[] {
    return [];
  } // [{ a: Entity, b: Entity }]
}
