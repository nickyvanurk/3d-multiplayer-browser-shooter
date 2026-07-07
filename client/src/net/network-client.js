import { Object3D } from 'three';

import Types from '../../../shared/types.js';
import Messages from '../../../shared/messages.js';
import { Ship } from '../../../shared/sim/entities/ship.js';
import { Asteroid } from '../../../shared/sim/entities/asteroid.js';
import { Bullet } from '../../../shared/sim/entities/bullet.js';

// Folds the old network-event-system + network-message-system. The client World
// is a pure state mirror: entities are created/destroyed and their transforms set
// from server messages. The client NEVER ticks the sim (that would double-spawn
// bullets). ViewRegistry reacts to spawn/despawn via world.onSpawn/onDespawn.
export class NetworkClient {
  constructor(connection, world, camera, name = 'Nicky') {
    this.connection = connection;
    this.world = world;
    this.camera = camera;
    this.name = name;
    this.localPlayerId = null;
    this._cameraDummy = new Object3D();
  }

  processMessages(delta) {
    while (this.connection.hasIncomingMessage()) {
      const message = this.connection.popMessage();

      switch (message.type) {
        case Types.Messages.GO:
          this.connection.pushMessage(new Messages.Hello(this.name));
          this.connection.sendOutgoingMessages();
          break;
        case Types.Messages.WELCOME: {
          const { id } = message.data;
          this.localPlayerId = id;
          this.world.localPlayerId = id;

          // Spawn may have arrived before Welcome (server queues Spawn then
          // Welcome for the joining ship), so snap the camera here too.
          const ship = this.world.get(id);
          if (ship) {this.snapCameraTo(ship.transform.position, ship.transform.rotation);}
          break;
        }
        case Types.Messages.SPAWN: {
          const { id, kind, position, rotation, scale } = message.data;
          this.spawnEntity(id, kind, position, rotation, scale);
          if (id === this.localPlayerId) {this.snapCameraTo(position, rotation);}
          break;
        }
        case Types.Messages.DESPAWN:
          this.world.despawn(message.data.id);
          break;
        case Types.Messages.WORLD:
          this.applyWorldState(message.data, delta);
          break;
      }
    }
  }

  spawnEntity(id, kind, position, rotation, scale) {
    let entity;

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
  applyWorldState(entities, delta) {
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

      if (id === this.localPlayerId) {this.followCamera(transform, delta);}
    }
  }

  sendInput(input) {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {return;}

    this.connection.pushMessage(new Messages.Input(input));
    this.connection.sendOutgoingMessages();
  }

  snapCameraTo(position, rotation) {
    const obj = this._cameraDummy;
    obj.position.copy(position);
    obj.quaternion.copy(rotation);
    obj.translateY(4);
    obj.translateZ(-14);
    obj.rotateY(Math.PI);
    this.camera.position.copy(obj.position);
    this.camera.quaternion.copy(obj.quaternion);
  }

  followCamera(transform, delta) {
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
