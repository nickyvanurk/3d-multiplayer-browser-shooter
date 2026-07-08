import { Transform } from './transform.js';
import type { TransformInit } from './transform.js';
import type { EntityKind } from '../types.js';
import type { Vector3 } from 'three';

export interface EntityInit {
  id?: number;
  type: EntityKind;
  transform?: TransformInit;
}

// The physics body attached to an entity by the server-side stepper. The SIM
// itself only stores/checks the reference; the concrete implementation
// (AmmoPhysicsWorld's btRigidBody) satisfies this structurally and carries the
// `entity` back-reference the collision code reads.
export interface PhysicsBody {
  entity?: Entity;
}

// Minimal world contract Entity.update depends on: spawning derived entities.
export interface EntityWorld {
  spawn<T extends Entity>(entity: T): T;
}

export class Entity {
  id: number | undefined;
  type: EntityKind;
  transform: Transform;
  destroyed: boolean;
  velocity!: Vector3;
  angularVelocity!: Vector3;
  weight!: number;
  damping!: number;
  angularDamping!: number;
  kinematic!: boolean;
  alive?: boolean;
  body!: PhysicsBody | null;

  constructor({ id, type, transform }: EntityInit = {} as EntityInit) {
    this.id = id;
    this.type = type; // Types.Entities.*
    this.transform = new Transform(transform);
    this.destroyed = false;
  }

  update(_dt: number, _world: EntityWorld, _time: number): void {}

  markDestroyed(): void {
    this.destroyed = true;
  }

  // Network state = the fields that replicate to clients (position + rotation).
  // Matches the Messages.World wire layout (7 numbers after the id).
  serializeNetworkState(): number[] {
    const { position: p, rotation: r } = this.transform;
    return [p.x, p.y, p.z, r.x, r.y, r.z, r.w];
  }

  applyNetworkState([px, py, pz, rx, ry, rz, rw]: number[]): void {
    this.transform.position.set(px, py, pz);
    this.transform.rotation.set(rx, ry, rz, rw);
  }
}
