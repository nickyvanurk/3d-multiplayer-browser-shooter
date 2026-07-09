import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion } from 'three';

import Types from '../../types.ts';
import type { EntityKind } from '../../types.ts';
import type { Entity, PhysicsBody } from '../entity.ts';
import type { Bullet } from '../entities/bullet.ts';
import type { World } from '../world.ts';
import type { PhysicsWorld, Collision } from './physics-world.ts';
import type { MeshProvider } from './mesh-provider.ts';

// The fixed timestep (updatesPerSecond = 60), in seconds. Used to convert
// damping coefficients; the conversion barely moves across the 30–60 Hz range,
// so a nominal value is fine.
const NOMINAL_STEP_S = 1 / 60;

// Ammo damps velocity by (1 - d)^dt per step; Rapier by 1/(1 + c·dt). The same
// coefficient means very different things (at d=0.99 Ammo keeps 93%/step, Rapier
// 98%), which makes rotation feel far too strong. Convert Ammo's coefficient to
// the Rapier one that yields the same per-step retention.
function ammoDampingToRapier(d: number): number {
  return ((1 - d) ** -NOMINAL_STEP_S - 1) / NOMINAL_STEP_S;
}

// Solid-box inertia over a point cloud's local AABB — Bullet's convex-hull
// inertia approximation, reproduced so rotation feel matches the Ammo build.
function boxInertiaFromPoints(
  points: Float32Array,
  mass: number,
): { x: number; y: number; z: number } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
    minZ = Math.min(minZ, points[i + 2]);
    maxZ = Math.max(maxZ, points[i + 2]);
  }
  const lx = maxX - minX;
  const ly = maxY - minY;
  const lz = maxZ - minZ;
  return {
    x: (mass / 12) * (ly * ly + lz * lz),
    y: (mass / 12) * (lx * lx + lz * lz),
    z: (mass / 12) * (lx * lx + ly * ly),
  };
}

export class RapierPhysicsWorld implements PhysicsWorld {
  ready: boolean;
  collisions: Collision[];
  onReady: (() => void) | null;
  meshProvider: MeshProvider;
  // Server owns ship-body lifecycle via alive-transitions (respawn). The client
  // manages the single owned ship's body itself and must NOT auto-body remote
  // ships, so it disables this.
  reconcileShips: boolean;
  world!: RAPIER.World;
  eventQueue!: RAPIER.EventQueue;
  // Convex-hull point clouds cached by `${kind}:${scale}`; extracting/merging
  // triangles is the expensive part, so it's done once per shape.
  vertices: Map<string, Float32Array>;
  // Collider handle -> entity, to recover game entities from collision events.
  handleToEntity: Map<number, Entity>;
  // Entities that currently own a body, iterated for post-step write-back.
  bodies: Set<Entity>;

  private readonly scratchVec: Vector3;
  private readonly scratchVec2: Vector3;
  private readonly scratchQuat: Quaternion;

  constructor(meshProvider: MeshProvider) {
    this.ready = false;
    this.collisions = [];
    this.onReady = null;
    this.meshProvider = meshProvider;
    this.reconcileShips = true;
    this.vertices = new Map();
    this.handleToEntity = new Map();
    this.bodies = new Set();
    this.scratchVec = new Vector3();
    this.scratchVec2 = new Vector3();
    this.scratchQuat = new Quaternion();
  }

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);

    await this.meshProvider.init();
    // Prewarm the convex-hull caches for the two hulled shapes.
    this.getConvexVertices(Types.Entities.SPACESHIP, 1);
    this.getConvexVertices(Types.Entities.ASTEROID, 1);

    this.ready = true;
    if (this.onReady) {
      this.onReady();
    }
  }

  add(entity: Entity): void {
    // Bullets are fast movers: a solver body integrating ~8 units/step tunnels
    // straight through anything smaller than one step. They carry no collider or
    // rigid body at all — sweepProjectiles() raycasts their path each tick.
    if (entity.type === Types.Entities.BULLET) {
      return;
    }

    const body = this.world.createRigidBody(this.createBodyDesc(entity));
    const collider = this.world.createCollider(
      this.createColliderDesc(entity),
      body,
    );

    entity.body = body as unknown as PhysicsBody;
    this.handleToEntity.set(collider.handle, entity);
    this.bodies.add(entity);
  }

  remove(entity: Entity): void {
    if (!entity.body) {
      return;
    }
    const body = entity.body as unknown as RAPIER.RigidBody;
    for (let i = 0; i < body.numColliders(); i++) {
      this.handleToEntity.delete(body.collider(i).handle);
    }
    // removeRigidBody frees the body's colliders too; Rapier owns the WASM
    // memory, so there is no manual destroy() bookkeeping.
    this.world.removeRigidBody(body);
    this.bodies.delete(entity);
    entity.body = null;
  }

  applyAll(world: World, _delta: number): void {
    if (this.reconcileShips) {
      this.reconcile(world);
    }

    for (const entity of world.entities.values()) {
      if (entity.destroyed || entity.alive === false || !entity.body) {
        continue;
      }

      const body = entity.body as unknown as RAPIER.RigidBody;

      if (entity.kinematic) {
        // Player ships are kinematic bodies driven by client-authoritative
        // state: place the body at exactly the reported pose (no extrapolation).
        body.setNextKinematicTranslation(entity.transform.position);
        body.setNextKinematicRotation(entity.transform.rotation);
        continue;
      }

      if (entity.weight === 0) {
        continue;
      }

      // Ammo's applyCentralLocalForce/applyLocalTorque are body-local; Rapier's
      // addForce/addTorque are world-space, so rotate by the body's orientation.
      // Forces persist across steps in Rapier, so reset before re-applying.
      const r = body.rotation();
      const q = this.scratchQuat.set(r.x, r.y, r.z, r.w);

      body.resetForces(false);
      body.addForce(
        this.scratchVec.copy(entity.velocity).applyQuaternion(q),
        true,
      );
      body.resetTorques(false);
      body.addTorque(
        this.scratchVec.copy(entity.angularVelocity).applyQuaternion(q),
        true,
      );
    }
  }

  // A dead ship (alive === false) must have no physics body; on revive it gets
  // one back. Reconciling here keeps combat/respawn subsystems decoupled from
  // physics — they only flip `alive`, and the stepper owns body presence.
  reconcile(world: World): void {
    for (const entity of world.entities.values()) {
      if (entity.type !== Types.Entities.SPACESHIP) {
        continue;
      }

      if (entity.alive === false && entity.body) {
        this.remove(entity);
      } else if (entity.alive === true && !entity.body) {
        this.add(entity);
      }
    }
  }

  step(delta: number): void {
    this.world.timestep = delta / 1000;
    this.world.step(this.eventQueue);
    this.detectCollisions();
    this.writeBack();
  }

  drainCollisions(): Collision[] {
    const collisions = this.collisions;
    this.collisions = [];
    return collisions;
  }

  // Bullets carry no collider; instead we sweep a ray along each bullet's path
  // this tick (prev -> next position). This is CCD-by-construction: a bullet can
  // never tunnel through a target, however small or fast. Run AFTER step() so
  // ships/asteroids sit at their current poses. Hits are pushed onto the same
  // collision queue combat drains, so bullet↔entity damage flows unchanged.
  sweepProjectiles(world: World, delta: number): void {
    for (const entity of world.entities.values()) {
      if (entity.type !== Types.Entities.BULLET || entity.destroyed) {
        continue;
      }

      const from = this.scratchVec.copy(entity.transform.position);
      const step = this.scratchVec2
        .copy(entity.velocity)
        .applyQuaternion(entity.transform.rotation)
        .multiplyScalar(delta);

      entity.transform.prevPosition.copy(from);

      const hit = this.castSegment(from, step, (entity as Bullet).owner);
      if (hit) {
        entity.transform.position.copy(from).addScaledVector(step, hit.toi);
        this.collisions.push({ a: entity, b: hit.entity });
        continue;
      }

      entity.transform.position.copy(from).add(step);
    }
  }

  // Raycast the segment `from -> from + step` and return the first live entity it
  // hits (with the fraction along the segment), excluding `exclude`'s body. This
  // is how bullets detect hits without a collider — a swept ray can't tunnel.
  castSegment(
    from: Vector3,
    step: Vector3,
    exclude?: Entity | null,
  ): { entity: Entity; toi: number } | null {
    if (step.length() === 0) {
      return null;
    }
    // Ray dir is the full segment; maxToi 1 => hit point is from + step*toi.
    // solid=true so a segment starting inside a target still registers.
    const ray = new RAPIER.Ray(from, step);
    const excludeBody = exclude?.body
      ? (exclude.body as unknown as RAPIER.RigidBody)
      : undefined;
    const hit = this.world.castRay(
      ray,
      1,
      true,
      undefined,
      undefined,
      undefined,
      excludeBody,
    );
    if (!hit) {
      return null;
    }
    const entity = this.handleToEntity.get(hit.collider.handle);
    if (!entity || entity.destroyed || entity.alive === false) {
      return null;
    }
    return { entity, toi: hit.timeOfImpact };
  }

  detectCollisions(): void {
    this.eventQueue.drainCollisionEvents(
      (handle1: number, handle2: number, started: boolean) => {
        if (!started) {
          return;
        }

        const a = this.handleToEntity.get(handle1);
        const b = this.handleToEntity.get(handle2);

        if (!a || !b || a.destroyed || b.destroyed) {
          return;
        }
        if (a.alive === false || b.alive === false) {
          return;
        }

        // Combat handles both directions (dealDamage(a,b) and dealDamage(b,a)),
        // so a single pair per contact is enough.
        this.collisions.push({ a, b });
      },
    );
  }

  writeBack(): void {
    for (const entity of this.bodies) {
      if (entity.destroyed || entity.alive === false || !entity.body) {
        continue;
      }
      // Fixed bodies never move; only dynamic and kinematic bodies write back.
      if (entity.weight === 0 && !entity.kinematic) {
        continue;
      }
      // Player ships are authoritative on the client that owns them; their pose
      // comes from client state, not the solver, so don't overwrite it here.
      if (entity.kinematic && entity.type === Types.Entities.SPACESHIP) {
        continue;
      }

      const body = entity.body as unknown as RAPIER.RigidBody;
      const o = body.translation();
      const q = body.rotation();
      entity.transform.position.set(o.x, o.y, o.z);
      entity.transform.rotation.set(q.x, q.y, q.z, q.w);
    }
  }

  createBodyDesc(entity: Entity): RAPIER.RigidBodyDesc {
    const pos = entity.transform.position;
    const rot = entity.transform.rotation;

    let desc: RAPIER.RigidBodyDesc;
    if (entity.kinematic) {
      desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    } else if (entity.weight === 0) {
      desc = RAPIER.RigidBodyDesc.fixed();
    } else {
      desc = RAPIER.RigidBodyDesc.dynamic();
    }

    return desc
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
      .setLinvel(entity.velocity.x, entity.velocity.y, entity.velocity.z)
      .setAngvel({
        x: entity.angularVelocity.x,
        y: entity.angularVelocity.y,
        z: entity.angularVelocity.z,
      })
      .setLinearDamping(ammoDampingToRapier(entity.damping))
      .setAngularDamping(ammoDampingToRapier(entity.angularDamping))
      .setCanSleep(false)
      .setCcdEnabled(true);
  }

  createColliderDesc(entity: Entity): RAPIER.ColliderDesc {
    const desc = this.createShapeDesc(entity)
      .setRestitution(0)
      .setFriction(0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    if (entity.weight !== 0) {
      // Ammo approximated a convex hull's rotational inertia from its bounding
      // box (btConvexInternalShape::calculateLocalInertia), which is several
      // times larger than Rapier's true-hull inertia — notably ~4x on yaw. Using
      // the hull inertia makes mouse-look rotation feel far too strong, so match
      // Ammo's box approximation to preserve the tuned handling.
      const points = this.getConvexVertices(
        entity.type,
        entity.transform.scale,
      );
      const inertia = boxInertiaFromPoints(points, entity.weight);
      desc.setMassProperties(entity.weight, { x: 0, y: 0, z: 0 }, inertia, {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      });
    }

    return desc;
  }

  createShapeDesc(entity: Entity): RAPIER.ColliderDesc {
    const points = this.getConvexVertices(entity.type, entity.transform.scale);
    const desc = RAPIER.ColliderDesc.convexHull(points);
    if (!desc) {
      throw new Error(`Failed to build convex hull for entity ${entity.type}`);
    }
    return desc;
  }

  getConvexVertices(kind: EntityKind, scale: number): Float32Array {
    const key = `${kind}:${scale}`;
    const cached = this.vertices.get(key);
    if (cached) {
      return cached;
    }

    const triangles = this.meshProvider.getTriangles(kind, scale);
    // Some source meshes (the asteroid GLB) carry NaN vertices. Ammo's hull
    // builder silently tolerated them; Rapier's qhull yields an invalid shape
    // that createCollider rejects, so drop any non-finite points.
    const coords: number[] = [];
    for (const triangle of triangles) {
      for (const point of triangle) {
        if (
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          Number.isFinite(point.z)
        ) {
          coords.push(point.x, point.y, point.z);
        }
      }
    }

    const points = new Float32Array(coords);
    this.vertices.set(key, points);
    return points;
  }
}
