import type { Vector3, Quaternion } from 'three';
import type { Entity } from '../entity.ts';
import type { World } from '../world.ts';

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
  // Integrates bullets and raycasts their swept path (prev -> next) for hits,
  // enqueuing them onto the collision stream. Bullets carry no solver body, so a
  // stepper without this leaves them motionless (Rapier only). Call after step().
  sweepProjectiles?(world: World, dt: number): void;
  // Rescales each mined asteroid's collider to match its shrinking render (ore
  // drives both), so shots and ships meet the rock the player sees. Rapier only.
  syncAsteroidScales?(world: World): void;
  // Snaps a networked body to an authoritative pose+velocity so it coasts and
  // collides until the next correction (state-sync). Rapier only.
  correctBody?(
    entity: Entity,
    position: Vector3,
    rotation: Quaternion,
    velocity: Vector3,
    angularVelocity: Vector3,
  ): void;
  // Sets a dead-reckoned remote ship's body damping so it coasts to match its
  // owner's motion (constant velocity while thrusting, damped while idle),
  // keeping the aim-lead — which reads linvel() — from jittering. Rapier only.
  setRemoteShipCoast?(entity: Entity, thrusting: boolean): void;
  // Restores a body's full flight-model damping (for a claimed owned ship that may
  // have been briefly corrected as a remote body). Rapier only.
  setFlightDamping?(entity: Entity): void;
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
