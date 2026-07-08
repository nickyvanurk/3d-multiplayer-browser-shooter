import { Vector3 } from 'three';

import Types from '../../shared/types.ts';
import { InputCommand } from '../../shared/sim/input.ts';
import { Ship, createDefaultWeapons } from '../../shared/sim/entities/ship.ts';
import type { Bullet } from '../../shared/sim/entities/bullet.ts';
import type { World } from '../../shared/sim/world.ts';
import type { Entity, EntityWorld } from '../../shared/sim/entity.ts';
import type { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';

// Predicted-entity ids live far above the server's dense id range so they never
// collide with server-owned ids in the shared world map.
const CLIENT_ID_BASE = 1_000_000;

// The client-authoritative half of the sim. Ticks ONLY entities this client
// owns — its own ship (driven by local input, collided against the static
// asteroid field on the client's Rapier world) and the cosmetic bullets it
// predicts on fire. Remote entities stay pure mirrors updated by NetworkClient.
export class ClientSim {
  world: World;
  physics: RapierPhysicsWorld;
  ownedShip: Ship | null;
  predictedBullets: Bullet[];
  nextBulletId: number;
  // Emitted when the owned ship fires a predicted bullet, so NetworkClient can
  // send the matching authoritative Fire request to the server.
  onFire: ((bullet: Bullet) => void) | null;

  private readonly scratch: Vector3;
  private readonly simWorld: EntityWorld;

  constructor(world: World, physics: RapierPhysicsWorld) {
    this.world = world;
    this.physics = physics;
    this.ownedShip = null;
    this.predictedBullets = [];
    this.nextBulletId = CLIENT_ID_BASE;
    this.onFire = null;
    this.scratch = new Vector3();
    // Ship.update spawns bullets through this; we intercept to give them
    // client-range ids, track them, and notify the server.
    this.simWorld = { spawn: (entity) => this.spawnFromSim(entity) };
  }

  // The local player's ship became known (WELCOME/SPAWN). Make it controllable:
  // give it weapons + an input controller and a physics body (dynamic — it is
  // simulated locally, unlike the server's kinematic mirror of it).
  setOwnedShip(ship: Ship): void {
    if (this.ownedShip === ship) {
      return;
    }
    this.ownedShip = ship;
    ship.controller = { lastInput: InputCommand.empty() };
    ship.weapons = createDefaultWeapons(ship);
    if (!ship.body) {
      this.physics.add(ship);
    }
  }

  onSpawn(entity: Entity): void {
    // Every ship is simulated in the client physics world: the owned one is
    // input-driven, remote ones coast on their server-reported velocity and get
    // corrected each snapshot (NetworkClient.applyWorldState). This is what lets
    // the client sim the whole world and gives real ship-vs-ship collisions.
    if (entity.type === Types.Entities.SPACESHIP) {
      if (!entity.body) {
        this.physics.add(entity);
      }
      return;
    }
    // Only the static (large) asteroids become client colliders. Small dynamic
    // asteroids move on the server and would drift from a fixed client body;
    // skip them in this cut (the owned ship passes through them locally).
    if (entity.type === Types.Entities.ASTEROID && entity.weight === 0) {
      this.physics.add(entity);
    }
  }

  onDespawn(entity: Entity): void {
    if (entity.body) {
      this.physics.remove(entity);
    }
    if (entity === this.ownedShip) {
      this.ownedShip = null;
    }
    const i = this.predictedBullets.indexOf(entity as Bullet);
    if (i !== -1) {
      this.predictedBullets.splice(i, 1);
    }
  }

  update(dt: number, time: number, input: InputCommand): void {
    // Snapshot prev poses for every physics-simmed entity (all ships + predicted
    // bullets) so the renderer can interpolate between fixed steps.
    for (const entity of this.world.entities.values()) {
      if (entity.type === Types.Entities.SPACESHIP && entity.body) {
        this.snapshotPrev(entity);
      }
    }
    for (const bullet of this.predictedBullets) {
      this.snapshotPrev(bullet);
    }

    const ship = this.ownedShip;
    if (ship && ship.alive !== false) {
      ship.controller!.lastInput = input;
      // applyInput + weapon fire; fired bullets spawn through simWorld.
      ship.update(dt, this.simWorld, time);
    }

    // Remote ships coast: no controller/weapons, so update() applies empty input
    // and the body drifts on its server-corrected velocity until the next snapshot.
    for (const entity of this.world.entities.values()) {
      if (
        entity.type === Types.Entities.SPACESHIP &&
        entity !== ship &&
        entity.alive !== false &&
        entity.body
      ) {
        entity.update(dt, this.simWorld, time);
      }
    }

    this.physics.applyAll?.(this.world, dt);
    this.physics.step(dt);
    this.physics.drainCollisions(); // discard — hit detection is server-side

    this.integrateBullets(dt);
  }

  private snapshotPrev(entity: Entity): void {
    entity.transform.prevPosition.copy(entity.transform.position);
    entity.transform.prevRotation.copy(entity.transform.rotation);
  }

  private integrateBullets(dt: number): void {
    for (const bullet of this.predictedBullets) {
      this.scratch
        .copy(bullet.velocity)
        .applyQuaternion(bullet.transform.rotation)
        .multiplyScalar(dt);
      bullet.transform.position.add(this.scratch);
      bullet.update(dt); // ages the bullet; marks destroyed past its timeout
    }
    for (const bullet of [...this.predictedBullets]) {
      if (bullet.destroyed) {
        this.world.despawn(bullet.id!); // onDespawn drops it from the list
      }
    }
  }

  private spawnFromSim<T extends Entity>(entity: T): T {
    if (entity.type === Types.Entities.BULLET) {
      const id = this.nextBulletId++;
      this.world.spawnWithId(id, entity);
      const bullet = entity as unknown as Bullet;
      this.predictedBullets.push(bullet);
      this.onFire?.(bullet);
      return entity;
    }
    return this.world.spawn(entity);
  }
}

// Re-exported so callers can distinguish owned from server ids without importing
// the constant twice.
export { CLIENT_ID_BASE, Ship };
