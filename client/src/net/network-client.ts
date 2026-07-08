import { Object3D } from 'three';
import type { Camera, Vector3, Quaternion } from 'three';

import Types from '../../../shared/types.ts';
import Messages from '../../../shared/messages.ts';
import { Ship } from '../../../shared/sim/entities/ship.ts';
import { Asteroid } from '../../../shared/sim/entities/asteroid.ts';
import { Bullet } from '../../../shared/sim/entities/bullet.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { Transform } from '../../../shared/sim/transform.ts';
import type { InputCommandData } from '../../../shared/sim/input.ts';
import type Connection from '../connection.ts';

// The client mirror World gains a runtime-only pointer to the local player's id.
type ClientWorld = World & { localPlayerId?: number };

// Folds the old network-event-system + network-message-system. The client World
// is a pure state mirror: entities are created/destroyed and their transforms set
// from server messages. The client NEVER ticks the sim (that would double-spawn
// bullets). ViewRegistry reacts to spawn/despawn via world.onSpawn/onDespawn.
export class NetworkClient {
  connection: Connection;
  world: ClientWorld;
  camera: Camera;
  name: string;
  localPlayerId: number | null;
  _cameraDummy: Object3D;

  constructor(
    connection: Connection,
    world: ClientWorld,
    camera: Camera,
    name = 'Nicky',
  ) {
    this.connection = connection;
    this.world = world;
    this.camera = camera;
    this.name = name;
    this.localPlayerId = null;
    this._cameraDummy = new Object3D();
  }

  processMessages(delta: number): void {
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
          // Welcome for the joining ship), so snap the camera here too.
          const ship = this.world.get(id);
          if (ship) {
            this.snapCameraTo(ship.transform.position, ship.transform.rotation);
          }
          break;
        }
        case Types.Messages.SPAWN: {
          const { id, kind, position, rotation, scale } = message!.data;
          this.spawnEntity(id, kind, position, rotation, scale);
          if (id === this.localPlayerId) {
            this.snapCameraTo(position, rotation);
          }
          break;
        }
        case Types.Messages.DESPAWN:
          this.world.despawn(message!.data.id);
          break;
        case Types.Messages.WORLD:
          this.applyWorldState(message!.data, delta);
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
  ): void {
    let entity: Entity;

    switch (kind) {
      case Types.Entities.SPACESHIP:
        entity = new Ship({ transform: { position, rotation, scale } });
        break;
      case Types.Entities.ASTEROID:
        entity = new Asteroid({ transform: { position, rotation }, scale });
        break;
      case Types.Entities.BULLET:
        entity = new Bullet({ transform: { position, rotation, scale } });
        break;
      default:
        console.error(`Unknown entity kind ${kind}`);
        return;
    }

    this.world.spawnWithId(id, entity);
  }

  // Interpolation bookkeeping the old transform-system relied on: remember the
  // previous transform, then copy in the new one. ViewRegistry.update(alpha)
  // lerps prev -> current each render frame.
  applyWorldState(
    entities: ReturnType<typeof Messages.World.deserialize>,
    delta: number,
  ): void {
    for (const { id, position, rotation } of entities) {
      const entity = this.world.get(id);

      if (!entity) {
        console.error(`Entity ${id} doesn't exist on client`);
        continue;
      }

      const transform = entity.transform;
      transform.prevPosition = transform.position.clone();
      transform.prevRotation = transform.rotation.clone();
      transform.position.copy(position);
      transform.rotation.copy(rotation);

      if (id === this.localPlayerId) {
        this.followCamera(transform, delta);
      }
    }
  }

  sendInput(input: InputCommandData): void {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {
      return;
    }

    this.connection.pushMessage(new Messages.Input(input));
    this.connection.sendOutgoingMessages();
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

  followCamera(transform: Transform, delta: number): void {
    const obj = this._cameraDummy;
    obj.position.copy(transform.position);
    obj.quaternion.copy(transform.rotation);
    obj.translateY(4);
    obj.translateZ(-14);
    obj.rotateY(Math.PI);

    const factor = 1 - Math.exp(-10 * (delta / 1000));
    this.camera.position.lerp(obj.position, factor);
    this.camera.quaternion.slerp(obj.quaternion, factor);
  }
}
