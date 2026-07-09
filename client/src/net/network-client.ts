import { Object3D, Vector3 } from 'three';
import type { Camera, Quaternion } from 'three';

import Types from '../../../shared/types.ts';
import Messages from '../../../shared/messages.ts';
import { Ship } from '../../../shared/sim/entities/ship.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import { Asteroid } from '../../../shared/sim/entities/asteroid.ts';
import { Bullet } from '../../../shared/sim/entities/bullet.ts';
import { Vendor } from '../../../shared/sim/entities/vendor.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { Transform } from '../../../shared/sim/transform.ts';
import type Connection from '../connection.ts';
import type { SettingsStore } from '../settings.ts';

// The client mirror World gains a runtime-only pointer to the local player's id.
type ClientWorld = World & { localPlayerId?: number };

// The subset of the Rapier RigidBody used to correct/read a simulated remote
// entity (entity.body is stored as the opaque PhysicsBody).
type Vec = { x: number; y: number; z: number };
type SimBody = {
  setTranslation(t: Vec, wake: boolean): void;
  setRotation(
    r: { x: number; y: number; z: number; w: number },
    wake: boolean,
  ): void;
  setLinvel(v: Vec, wake: boolean): void;
  setAngvel(v: Vec, wake: boolean): void;
  linvel(): Vec;
  angvel(): Vec;
};

// The message layer for the state-sync model: remote entities are a pure state
// mirror (created/destroyed and transform-set from server messages, interpolated
// for render); the LOCAL ship is owned by ClientSim and is skipped here. Sends
// the client-authoritative ship State each tick and Fire requests on shooting.
// ViewRegistry reacts to spawn/despawn via world.onSpawn/onDespawn.
export class NetworkClient {
  connection: Connection;
  world: ClientWorld;
  camera: Camera;
  settings: SettingsStore;
  name: string;
  localPlayerId: number | null;
  // Called when the local player's ship becomes known (WELCOME/SPAWN), so the
  // client sim can take ownership of it.
  onLocalShip: ((ship: Ship) => void) | null;
  _cameraDummy: Object3D;

  constructor(
    connection: Connection,
    world: ClientWorld,
    camera: Camera,
    settings: SettingsStore,
    name = 'Nicky',
  ) {
    this.connection = connection;
    this.world = world;
    this.camera = camera;
    this.settings = settings;
    this.name = name;
    this.localPlayerId = null;
    this.onLocalShip = null;
    this._cameraDummy = new Object3D();
  }

  processMessages(): void {
    while (this.connection.hasIncomingMessage()) {
      const message = this.connection.popMessage();

      switch (message!.type) {
        case Types.Messages.GO:
          this.connection.pushMessage(new Messages.Hello(this.name));
          this.connection.sendOutgoingMessages();
          break;
        case Types.Messages.WELCOME: {
          const { id } = message!.data;
          this.localPlayerId = id;
          this.world.localPlayerId = id;

          // Spawn may have arrived before Welcome (server queues Spawn then
          // Welcome for the joining ship), so snap the camera + claim ownership
          // here too.
          const ship = this.world.get(id);
          if (ship) {
            this.snapCameraTo(ship.transform.position, ship.transform.rotation);
            this.onLocalShip?.(ship as Ship);
          }
          break;
        }
        case Types.Messages.SPAWN: {
          const { id, kind, position, rotation, scale, name } = message!.data;
          const entity = this.spawnEntity(
            id,
            kind,
            position,
            rotation,
            scale,
            name,
          );
          if (id === this.localPlayerId && entity) {
            this.snapCameraTo(position, rotation);
            this.onLocalShip?.(entity as Ship);
          }
          break;
        }
        case Types.Messages.DESPAWN:
          this.world.despawn(message!.data.id);
          break;
        case Types.Messages.WORLD:
          this.applyWorldState(message!.data);
          break;
      }
    }
  }

  spawnEntity(
    id: number,
    kind: number,
    position: Vector3,
    rotation: Quaternion,
    scale: number,
    name = '',
  ): Entity | null {
    let entity: Entity;

    switch (kind) {
      case Types.Entities.SPACESHIP: {
        const ship = new Ship({ transform: { position, rotation, scale } });
        ship.name = name;
        entity = ship;
        break;
      }
      case Types.Entities.ASTEROID:
        entity = new Asteroid({ transform: { position, rotation }, scale });
        break;
      case Types.Entities.BULLET:
        entity = new Bullet({ transform: { position, rotation, scale } });
        break;
      case Types.Entities.VENDOR:
        entity = new Vendor({ transform: { position, rotation, scale } });
        break;
      default:
        console.error(`Unknown entity kind ${kind}`);
        return null;
    }

    this.world.spawnWithId(id, entity);
    return entity;
  }

  // Interpolation bookkeeping the old transform-system relied on: remember the
  // previous transform, then copy in the new one. ViewRegistry.update(alpha)
  // lerps prev -> current each render frame.
  applyWorldState(
    entities: ReturnType<typeof Messages.World.deserialize>,
  ): void {
    for (const {
      id,
      position,
      rotation,
      velocity,
      angularVelocity,
      input,
      health,
    } of entities) {
      // The local ship is client-authoritative; ignore the server's echo of it.
      if (id === this.localPlayerId) {
        continue;
      }

      const entity = this.world.get(id);

      if (!entity) {
        console.error(`Entity ${id} doesn't exist on client`);
        continue;
      }

      // Health is server-authoritative (combat runs there); mirror it onto the
      // remote entity so the HUD can draw enemy HP bars from the live value.
      const healthCarrier = entity as { health?: number };
      if (typeof healthCarrier.health === 'number') {
        healthCarrier.health = health;
      }

      // Decode the replicated thrust input for remote ships and the vendor NPC
      // (render-only; the renderer lights their engines from it). Kept off
      // `controller` so the client sim never re-applies it as thrust force.
      if (
        entity.type === Types.Entities.SPACESHIP ||
        entity.type === Types.Entities.VENDOR
      ) {
        const ship = entity as Ship;
        ship.renderInput = (ship.renderInput ?? new InputCommand()).applyBits(
          input,
        );
      }

      // The vendor is a kinematic NPC: correct its transform + velocity to the
      // server's authoritative state and let ClientSim dead-reckon its body on
      // that velocity between snapshots (prev is snapshotted there for interp).
      // Not routed through the body-correction branch below (setTranslation would
      // fight the kinematic body and skip the prev snapshot).
      if (entity.type === Types.Entities.VENDOR) {
        entity.transform.position.copy(position);
        entity.transform.rotation.copy(rotation);
        entity.velocity.copy(velocity);
        continue;
      }

      const body = entity.body as unknown as SimBody | null;
      if (body) {
        // Remote entity simulated in the client physics world: correct the body
        // to the server's authoritative state and let it coast on this velocity
        // until the next snapshot. ClientSim snapshots prev for render interp.
        body.setTranslation(position, true);
        body.setRotation(rotation, true);
        body.setLinvel(velocity, true);
        body.setAngvel(angularVelocity, true);
        entity.transform.position.copy(position);
        entity.transform.rotation.copy(rotation);
      } else {
        // Pure mirror (no physics body, e.g. remote bullets): interpolate
        // prev -> current for render.
        const transform = entity.transform;
        transform.prevPosition = transform.position.clone();
        transform.prevRotation = transform.rotation.clone();
        transform.position.copy(position);
        transform.rotation.copy(rotation);
      }
    }
  }

  // Client-authoritative movement: report the pose+velocities the owned ship
  // simulated locally this tick. The server copies these onto its kinematic body.
  sendState(ship: Ship): void {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {
      return;
    }

    // Report the ship's ACTUAL body velocity (not the control input), so other
    // clients can coast this ship accurately between snapshots.
    const { position, rotation } = ship.transform;
    const body = ship.body as unknown as SimBody | null;
    const lv = body ? body.linvel() : ship.velocity;
    const av = body ? body.angvel() : ship.angularVelocity;
    this.connection.pushMessage(
      new Messages.State(
        position,
        rotation,
        new Vector3(lv.x, lv.y, lv.z),
        new Vector3(av.x, av.y, av.z),
        ship.controller?.lastInput?.toBits() ?? 0,
      ),
    );
    this.connection.sendOutgoingMessages();
  }

  // A predicted bullet was fired locally; ask the server to spawn the
  // authoritative one (which owns damage/kills) at the same muzzle transform.
  sendFire(bullet: Bullet): void {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {
      return;
    }

    const { position, rotation } = bullet.transform;
    this.connection.pushMessage(
      new Messages.Fire(position, rotation, bullet.damage ?? 0, bullet.id!),
    );
    this.connection.sendOutgoingMessages();
  }

  // Drive the chase camera from the owned ship. `alpha` is the render
  // interpolation fraction — the camera MUST use the same interpolated pose as
  // the ship mesh, or the two sit on different timelines and the ship surges
  // toward/away from the camera at the sim-step rate.
  updateCamera(delta: number, alpha: number): void {
    if (this.localPlayerId == null) {
      return;
    }
    const ship = this.world.get(this.localPlayerId);
    if (ship) {
      this.followCamera(ship.transform, delta, alpha);
    }
  }

  snapCameraTo(position: Vector3, rotation: Quaternion): void {
    const obj = this._cameraDummy;
    obj.position.copy(position);
    obj.quaternion.copy(rotation);
    obj.translateY(4);
    obj.translateZ(-14);
    obj.rotateY(Math.PI);
    this.camera.position.copy(obj.position);
    this.camera.quaternion.copy(obj.quaternion);
  }

  followCamera(transform: Transform, delta: number, alpha: number): void {
    const obj = this._cameraDummy;
    // Interpolated pose — identical basis to ViewRegistry's mesh rendering.
    obj.position.copy(transform.prevPosition).lerp(transform.position, alpha);
    obj.quaternion
      .copy(transform.prevRotation)
      .slerp(transform.rotation, alpha);
    obj.translateY(4);
    obj.translateZ(-14);
    obj.rotateY(Math.PI);

    const factor =
      1 - Math.exp(-this.settings.cameraStiffness * (delta / 1000));
    this.camera.position.lerp(obj.position, factor);
    this.camera.quaternion.slerp(obj.quaternion, factor);
  }
}
