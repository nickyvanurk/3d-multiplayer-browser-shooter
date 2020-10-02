import { performance } from 'perf_hooks';
import { World as World$1 } from 'ecsy';
import { Vector3, Euler } from 'three';

import logger from './utils/logger';
import Utils from '../../shared/utils';
import Messages from '../../shared/messages';
import { Connection } from '../../shared/components/connection';
import { Playing } from '../../shared/components/playing';
import { Transform } from './components/transform';
import { RigidBody } from './components/rigidbody';
import { PlayerInputState } from '../../shared/components/player-input-state';
import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from './systems/network-message-system';
import { PlayerInputSystem } from './systems/player-input-system';
import { PhysicsSystem } from './systems/physics-system';

export default class World {
  constructor(id, maxClients, server) {
    this.id = id;
    this.maxClients = maxClients;
    this.server = server;
    this.updatesPerSecond = 60;
    this.lastTime = performance.now();

    this.clients = [];
    this.entities = [];

    this.connectedClients = 0;

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

  init() {
    this.fixedUpdate = Utils.createFixedTimestep(
      1000/this.updatesPerSecond,
      this.handleFixedUpdate.bind(this)
    );
    setInterval(this.update.bind(this), 1000/this.updatesPerSecond);
  }
  
  update() {
    const time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.fixedUpdate(delta, time);
    this.lastTime = time;
  }

  handleFixedUpdate(delta, time) {
    this.world.execute(delta, time);
  }

  handlePlayerConnect(connection) {
    logger.debug(`Adding client${connection.id} to ${this.id}`);
    
    connection.onDisconnect(() => {
      this.handlePlayerDisconnect(connection);
    });

    const clientId = this.getClientId();
    connection.id = clientId;

    this.clients[clientId] = this.world
      .createEntity()
      .addComponent(Connection, { value: connection });

    this.connectedClients++;
    
    connection.pushMessage(new Messages.Go());
  }
  
  handlePlayerDisconnect(connection) {
    logger.debug(`Deleting player ${connection.id}`);

    const entity = this.clients[connection.id];

    if (entity.hasComponent(Playing)) {
      this.broadcast(new Messages.Despawn(entity.worldId));
    }

    entity.remove();
    delete this.clients[connection.id];
    delete this.entities[entity.worldId];
    this.connectedClients--;
  }

  addPlayer(clientId) {
    logger.debug(`Creating player ${clientId}`);
    const clientEntity = this.clients[clientId];
    const entityId = this.getEntityId();

    clientEntity.worldId = entityId;

    this.entities[entityId] = clientEntity
      .addComponent(Playing)
      .addComponent(Transform, {
        position: this.getRandomPosition(), 
        rotation: new Vector3()
      })
      .addComponent(PlayerInputState)
      .addComponent(RigidBody, {
        acceleration: 0.00002,
        angularAcceleration: new Euler(0.0000625, 0.0000625, 0.000003),
        damping: 0.3,
        angularDamping: 0.1
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
    for (const [id, entity] of this.clients.entries()) {
      if (id == ignoredPlayerId || !entity) {
        continue;
      }
      
      const connection = entity.getComponent(Connection).value;
      connection.pushMessage(message);
    }
  }

  getClientId() {
    for (let i = 0; i < this.clients.length; ++i) {
      if (!this.clients[i]) {
        return i;
      }
    }

    return this.clients.length;
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
