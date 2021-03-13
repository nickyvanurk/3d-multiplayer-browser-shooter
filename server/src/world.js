import { performance } from 'perf_hooks';
import { World as World$1 } from 'ecsy';
import Ammo from 'ammo.js';

import logger from './utils/logger';
import Utils from '../../shared/utils';
import Messages from '../../shared/messages';
import * as Spawner from './spawner';

import { Connection } from '../../shared/components/connection';
import { Playing } from '../../shared/components/playing';
import { Transform } from './components/transform';
import { RigidBody } from './components/rigidbody';
import { Input } from '../../shared/components/input';
import { SpaceshipController } from '../../shared/components/spaceship-controller';
import { Kind } from '../../shared/components/kind';
import { Weapon } from './components/weapon';
import { Weapons } from './components/weapons';
import { Active } from './components/active';
import { Timeout } from './components/timeout';
import { Destroy } from './components/destroy';
import { Collision } from './components/collision';
import { Aim } from './components/aim';
import { Health } from './components/health';
import { Damage } from './components/damage';
import { Respawn } from './components/respawn';
import { SufferDamage } from './components/suffer-damage';
import { DestroyOnCollision } from './components/destroy-on-collision';
import { RandomSpawn } from './components/random-spawn';

import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from './systems/network-message-system';
import { SpaceshipControllerSystem } from './systems/spaceship-controller-system';
import { PhysicsSystem } from './systems/physics-system';
import { WeaponSystem } from './systems/weapon-system';
import { TimeoutSystem } from './systems/timeout-system';
import { DestroySystem } from './systems/destroy-system';
import { CollisionSystem } from './systems/collision-system';
import { DamageSystem } from './systems/damage-system';
import { SpawnSystem } from './systems/spawn-system';

export default class World {
  constructor(id, maxClients, server) {
    this.id = id;
    this.maxClients = maxClients;
    this.server = server;
    this.updatesPerSecond = 60;
    this.lastTime = performance.now();

    this.clients = [];

    this.connectedClients = 0;

    this.world = new World$1()
      .registerComponent(Connection)
      .registerComponent(Playing)
      .registerComponent(Transform)
      .registerComponent(RigidBody)
      .registerComponent(Input)
      .registerComponent(Kind)
      .registerComponent(Weapon)
      .registerComponent(Weapons)
      .registerComponent(Active)
      .registerComponent(Timeout)
      .registerComponent(Destroy)
      .registerComponent(Collision)
      .registerComponent(Aim)
      .registerComponent(Health)
      .registerComponent(Damage)
      .registerComponent(SpaceshipController)
      .registerComponent(Respawn)
      .registerComponent(SufferDamage)
      .registerComponent(DestroyOnCollision)
      .registerComponent(RandomSpawn);

    Ammo().then((Ammo) => {
      this.world
        .registerSystem(TimeoutSystem)
        .registerSystem(NetworkEventSystem, this)
        .registerSystem(SpawnSystem)
        .registerSystem(SpaceshipControllerSystem)
        .registerSystem(WeaponSystem, this)
        .registerSystem(PhysicsSystem, { worldServer: this, ammo: Ammo })
        .registerSystem(CollisionSystem)
        .registerSystem(DamageSystem)
        .registerSystem(DestroySystem)
        .registerSystem(NetworkMessageSystem, this);
    });

    this.world.entities = [];

    this.asteroidFieldSize = 800;

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
      .addComponent(Connection, { value: connection })
      .addComponent(Input);

    this.connectedClients++;

    connection.pushMessage(new Messages.Go());
  }

  handlePlayerDisconnect(connection) {
    logger.debug(`Deleting player ${connection.id}`);
    this.clients[connection.id].remove();
    delete this.clients[connection.id];
    this.connectedClients--;
  }

  getClientId() {
    for (let i = 0; i < this.clients.length; ++i) {
      if (!this.clients[i]) {
        return i;
      }
    }

    return this.clients.length;
  }

  spawnAsteroids(count) {
    const rng = Utils.randomNumberGenerator(5);

    for (let i = 0; i < count; ++i) {
      const position = Utils.getRandomPosition(this.asteroidFieldSize, rng);
      const rotation = Utils.getRandomQuaternion(rng);

      const scaleValue = [1, 5, 10, 20, 40, 60, /*120, 240, 560*/];
      const scale = scaleValue[Math.floor(rng() * scaleValue.length)];

      Spawner.asteroid(this.world, position, rotation, scale);
    }
  }
}
