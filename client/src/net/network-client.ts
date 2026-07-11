import { Object3D, Quaternion, Vector3 } from 'three';
import type { Camera } from 'three';

import Types from '../../../shared/types.ts';
import Messages from '../../../shared/messages.ts';
import { Ship } from '../../../shared/sim/entities/ship.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import { Asteroid } from '../../../shared/sim/entities/asteroid.ts';
import { Bullet } from '../../../shared/sim/entities/bullet.ts';
import { Vendor } from '../../../shared/sim/entities/vendor.ts';
import { TimeSyncManager } from '../../../shared/sim/net/time-sync.ts';
import {
  snapshotAge,
  extrapolatePosition,
  extrapolateRotation,
  resolveWorldVelocity,
} from '../../../shared/sim/net/extrapolate.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { Transform } from '../../../shared/sim/transform.ts';
import type Connection from '../connection.ts';
import type { SettingsStore } from '../settings.ts';

// The client mirror World gains a runtime-only pointer to the local player's id.
type ClientWorld = World & { localPlayerId?: number };

// Owner-only cargo/credits, as carried by the Stats message.
export type StatsData = ReturnType<typeof Messages.Stats.deserialize>;

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
  // Owner-only cargo/credits update (Stats), for the HUD.
  onStats: ((stats: StatsData) => void) | null;
  // A chunk broke off at a position (OreDrop), so the client renders it.
  onOreDrop: ((id: number, position: Vector3) => void) | null;
  // A chunk was collected authoritatively (Collect), so the client drops its copy.
  onCollect: ((id: number) => void) | null;
  timeSync: TimeSyncManager;
  // Smoothed round-trip time (ms) from the last PONGs, for the stats overlay.
  pingMs = 0;
  _cameraDummy: Object3D;
  // Reused per-entity in applyWorldState to avoid per-snapshot allocation.
  _extrapPos = new Vector3();
  _extrapRot = new Quaternion();
  _worldVel = new Vector3();

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
    this.onStats = null;
    this.onOreDrop = null;
    this.onCollect = null;
    this.timeSync = new TimeSyncManager();
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
        case Types.Messages.STATS: {
          const stats = message!.data;
          // Mirror onto the owned ship so anything reading it (and a late HUD)
          // sees the authoritative economy, then notify the HUD.
          const ship = this.world.get(this.localPlayerId ?? -1) as
            | Ship
            | undefined;
          if (ship) {
            ship.cargo = stats.cargo;
            ship.cargoCapacity = stats.cargoCapacity;
            ship.credits = stats.credits;
          }
          this.onStats?.(stats);
          break;
        }
        case Types.Messages.OREDROP:
          this.onOreDrop?.(message!.data.id, message!.data.position);
          break;
        case Types.Messages.COLLECT:
          this.onCollect?.(message!.data.id);
          break;
        case Types.Messages.PONG: {
          const { sentTime, serverTime, receiveTime } = message!.data;
          this.timeSync.onTimeResponse(sentTime, serverTime, receiveTime);
          const rtt = receiveTime - sentTime;
          this.pingMs = this.pingMs === 0 ? rtt : this.pingMs * 0.8 + rtt * 0.2;
          break;
        }
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
  // Resolve the entity's velocity to world space, then advance pose by `age`.
  // Bullets store local +z forward velocity and carry no body; everything with a
  // physics body reports world-space linvel already. Returns shared scratch
  // objects — copy out immediately, never hold across another call.
  extrapolatedPose(
    entity: Entity,
    position: Vector3,
    rotation: Quaternion,
    velocity: Vector3,
    angularVelocity: Vector3,
    age: number,
  ): { position: Vector3; rotation: Quaternion } {
    resolveWorldVelocity(this._worldVel, entity.type, velocity, rotation);
    extrapolatePosition(this._extrapPos, position, this._worldVel, age);
    extrapolateRotation(this._extrapRot, rotation, angularVelocity, age);
    return { position: this._extrapPos, rotation: this._extrapRot };
  }

  applyWorldState(
    snapshot: ReturnType<typeof Messages.World.deserialize>,
  ): void {
    const { entities } = snapshot;
    // How far the snapshot lags the synced server clock; 0 while unsynced.
    const age = snapshotAge(
      this.serverNow(),
      snapshot.serverTime,
      this.isSynced(),
    );
    for (const {
      id,
      position,
      rotation,
      velocity,
      angularVelocity,
      input,
      health,
    } of entities) {
      // The local ship is client-authoritative for MOVEMENT, so the server's
      // echo of its transform/velocity is ignored below. Health is the
      // exception: combat runs only on the server (never predicted locally), so
      // it must be mirrored here or the owner's HUD never sees its own damage.
      if (id === this.localPlayerId) {
        const local = this.world.get(id) as { health?: number } | undefined;
        if (local && typeof local.health === 'number') {
          local.health = health;
        }
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
      // Advance the received pose to the present server time (age past the
      // snapshot). Velocities fed to the body below stay RAW — only the pose is
      // extrapolated; the body then coasts on the true velocity.
      const pose = this.extrapolatedPose(
        entity,
        position,
        rotation,
        velocity,
        angularVelocity,
        age,
      );

      if (entity.type === Types.Entities.VENDOR) {
        entity.transform.position.copy(pose.position);
        entity.transform.rotation.copy(pose.rotation);
        entity.velocity.copy(velocity);
        continue;
      }

      const body = entity.body as unknown as SimBody | null;
      if (body) {
        // Remote entity simulated in the client physics world: correct the body
        // to the server's authoritative state and let it coast on this velocity
        // until the next snapshot. ClientSim snapshots prev for render interp.
        body.setTranslation(pose.position, true);
        body.setRotation(pose.rotation, true);
        body.setLinvel(velocity, true);
        body.setAngvel(angularVelocity, true);
        entity.transform.position.copy(pose.position);
        entity.transform.rotation.copy(pose.rotation);
      } else {
        // Pure mirror (no physics body, e.g. remote bullets): interpolate
        // prev -> current for render.
        const transform = entity.transform;
        transform.prevPosition = transform.position.clone();
        transform.prevRotation = transform.rotation.clone();
        transform.position.copy(pose.position);
        transform.rotation.copy(pose.rotation);
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

  // Vendor trades: ask the server (which validates docking range + funds) to
  // sell the hold / repair the hull. The server applies it and echoes the new
  // cargo/credits back via Stats.
  sendSell(): void {
    this.sendReliable(new Messages.Sell());
  }

  sendRepair(): void {
    this.sendReliable(new Messages.Repair());
  }

  private sendReliable(message: { serialize(): unknown[] }): void {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {
      return;
    }
    this.connection.pushMessage(message);
    this.connection.sendOutgoingMessages();
  }

  sendPing(): void {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {
      return;
    }
    this.connection.pushMessage(new Messages.Ping(performance.now()));
    this.connection.sendOutgoingMessages();
  }

  // Called on (re)connect: a new server process has an unrelated clock origin.
  resetSync(): void {
    this.timeSync.reset();
  }

  serverNow(): number {
    return this.timeSync.serverNow();
  }

  isSynced(): boolean {
    return this.timeSync.isSynced();
  }

  // Smoothed round-trip time in ms (0 until the first PONG).
  getPing(): number {
    return this.pingMs;
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
