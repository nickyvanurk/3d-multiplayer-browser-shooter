import { performance } from 'perf_hooks';
import { World as World$1 } from 'ecsy';
import { Vector3 } from 'three';

import logger from './utils/logger';
import Utils from '../../shared/utils';
import Messages from '../../shared/messages';
import { Connection } from '../../shared/components/connection';
import { Playing } from '../../shared/components/playing';
import { Transform } from '../../shared/components/transform';
import { RigidBody } from './components/rigidbody';
import { PlayerInputState } from '../../shared/components/player-input-state';
import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from './systems/network-message-system';
import { PlayerInputSystem } from './systems/player-input-system';
import { PhysicsSystem } from './systems/physics-system';

export default class World {
  constructor(id, maxPlayers, server) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.server = server;
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();

    this.players = {};
    this.entities = [];

    this.playerCount = 0;

    this.world = new World$1()
      .registerComponent(Connection)
      .registerComponent(Playing)
      .registerComponent(Transform)
      .registerComponent(RigidBody)
      .registerComponent(PlayerInputState)
      .registerSystem(NetworkEventSystem, this)
      .registerSystem(PlayerInputSystem)
      .registerSystem(PhysicsSystem)
      .registerSystem(NetworkMessageSystem, this);

    this.size = new Vector3(10, 10, 10);
    
    logger.info(`${this.id} running`);
  }
  
  run() {
    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);

    const time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.world.execute(delta, time);
    
    this.lastTime = time;
  }

  handlePlayerConnect(connection) {
    logger.debug(`Creating player ${connection.id}`);
    this.players[connection.id] = this.world
      .createEntity(connection.id)
      .addComponent(Connection, { value: connection });
    this.playerCount++;
    
    connection.onDisconnect(() => {
      this.handlePlayerDisconnect(connection);
    });
    
    connection.pushMessage(new Messages.Go());
  }
  
  handlePlayerDisconnect(connection) {
    logger.debug(`Deleting player ${connection.id}`);

    const entity = this.players[connection.id];

    if (entity.hasComponent(Playing)) {
      this.broadcast(new Messages.Despawn(connection.id));
    }

    entity.remove();
    delete this.players[connection.id];
    this.entities.pop();
    this.playerCount--;
  }

  addPlayer(id) {
    const playerEntity = this.players[id];
    this.entities[this.getEntityId()] = playerEntity
      .addComponent(Playing)
      .addComponent(Transform, {
        position: this.getRandomPosition(), 
        rotation: Utils.getRandomRotation()
      })
      .addComponent(PlayerInputState)
      .addComponent(RigidBody, {
        acceleration: 0.00002,
        damping: 0.3
      });
  }

  getRandomPosition() {
    return new Vector3(
      Utils.random(this.size.x + 1) - this.size.x/2,
      Utils.random(this.size.y + 1) - this.size.y/2,
      Utils.random(this.size.z + 1) - this.size.z/2
    );
  }

  broadcast(message, ignoredPlayerId = null) {
    for (const [id, entity] of Object.entries(this.players)) {
      if (id == ignoredPlayerId) {
        continue;
      }
      
      const connection = entity.getComponent(Connection).value;
      connection.pushMessage(message);
    }
  }

  getEntityId() {
    for (let i = 0; i < this.entities.length; ++i) {
      if (!this.entities[i]) {
        return i;
      }
    }

    return this.entities.length;
  }
}
