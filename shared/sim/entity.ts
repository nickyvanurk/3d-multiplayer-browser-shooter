import { Vector3 } from 'three';
import { Transform } from './transform.ts';
import type { TransformInit } from './transform.ts';
import type { EntityKind } from '../types.ts';

export interface EntityInit {
  id?: number;
  type: EntityKind;
  transform?: TransformInit;
}

// The physics body attached to an entity by the server-side stepper. The SIM
// itself only stores/checks the reference; the concrete implementation
// (RapierPhysicsWorld's RigidBody) satisfies this structurally. The stepper
// keeps its own handle -> entity map for collision recovery.
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
  // Server-side self-propelled body (AI bots): unlike client-authoritative player
  // ships — which the server only mirrors via correctBody — a self-simulated ship
  // runs the real thrust/torque physics from its controller input, exactly like a
  // client-owned ship. Lets the stepper apply forces even when writeBackVelocity
  // is on. Default off (mirrored).
  selfSimulated!: boolean;

  constructor({ id, type, transform }: EntityInit = {} as EntityInit) {
    this.id = id;
    this.type = type; // Types.Entities.*
    this.transform = new Transform(transform);
    this.destroyed = false;
    this.selfSimulated = false;
    // Subclasses overwrite these; base defaults keep serializeNetworkState safe.
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
  }

  update(_dt: number, _world: EntityWorld, _time: number): void {}

  markDestroyed(): void {
    this.destroyed = true;
  }

  // Network state = the fields that replicate to clients: position + rotation
  // plus linear + angular velocity, so clients can coast remote entities in
  // their own physics sim between snapshots. The last three slots are a packed
  // input bitmask, current health and current level, all meaningful only for
  // ships (Ship overrides); 0 for everything else. 16 numbers after the id.
  serializeNetworkState(): number[] {
    const { position: p, rotation: r } = this.transform;
    const v = this.velocity;
    const a = this.angularVelocity;
    return [
      p.x,
      p.y,
      p.z,
      r.x,
      r.y,
      r.z,
      r.w,
      v.x,
      v.y,
      v.z,
      a.x,
      a.y,
      a.z,
      0,
      0,
      0,
    ];
  }

  applyNetworkState([
    px,
    py,
    pz,
    rx,
    ry,
    rz,
    rw,
    vx,
    vy,
    vz,
    ax,
    ay,
    az,
  ]: number[]): void {
    this.transform.position.set(px, py, pz);
    this.transform.rotation.set(rx, ry, rz, rw);
    this.velocity.set(vx, vy, vz);
    this.angularVelocity.set(ax, ay, az);
  }
}
