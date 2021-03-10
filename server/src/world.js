import { performance } from 'perf_hooks';
import { World as World$1 } from 'ecsy';
import { Vector3, Quaternion, Ray, Matrix4 } from 'three';
import Ammo from 'ammo.js';

import logger from './utils/logger';
import Utils from '../../shared/utils';
import Messages from '../../shared/messages';
import Types from '../../shared/types';
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

import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from './systems/network-message-system';
import { SpaceshipControllerSystem } from './systems/spaceship-controller-system';
import { PhysicsSystem } from './systems/physics-system';
import { WeaponSystem } from './systems/weapon-system';
import { TimeoutSystem } from './systems/timeout-system';
import { DestroySystem } from './systems/destroy-system';
import { CollisionSystem } from './systems/collision-system';
import { DamageSystem } from './systems/damage-system';

import * as Spawner from './spawner';

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
      .registerComponent(DestroyOnCollision);

    Ammo().then((Ammo) => {
      this.world
        .registerSystem(NetworkEventSystem, this)
        .registerSystem(SpaceshipControllerSystem)
        .registerSystem(WeaponSystem, this)
        .registerSystem(TimeoutSystem)
        .registerSystem(PhysicsSystem, { worldServer: this, ammo: Ammo })
        .registerSystem(CollisionSystem)
        .registerSystem(DamageSystem, this)
        .registerSystem(DestroySystem, this)
        .registerSystem(NetworkMessageSystem, this);
    });

    this.asteroidFieldSize = 800;
    this.playerSpawnAreaSize = 10;

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

    const entity = this.clients[connection.id];

    if (entity.hasComponent(Playing)) {
      this.broadcast(new Messages.Despawn(entity.id));
    }

    entity.remove();
    delete this.clients[connection.id];
    this.connectedClients--;
  }

  addPlayer(clientId) {
    const spaceship = Spawner.spawnControllableSpaceship(
      this.world,
      this.clients[clientId],
      Utils.getRandomPosition(this.playerSpawnAreaSize)
    );

    return spaceship;
  }

  addBullet(weapon) {
    const parentTransform = weapon.parent.getComponent(Transform);

    const pos = new Vector3().copy(weapon.offset)
      .applyQuaternion(parentTransform.rotation)
      .add(parentTransform.position);
    let rot = parentTransform.rotation;

    if (weapon.parent.hasComponent(Aim)) {
      const ray = weapon.parent.getComponent(Aim);

      const target = new Vector3();
      new Ray(ray.position, ray.direction).at(ray.distance, target);

      const direction = new Vector3();
      direction.subVectors(pos, target).normalize();

      const mx = new Matrix4().lookAt(direction, new Vector3(0,0,0), new Vector3(0,1,0));
      const qt = new Quaternion().setFromRotationMatrix(mx);
      rot = qt;
    }

    const bulletEntity = Spawner.projectile(this.world, pos, rot, 5);

    const { position, rotation, scale } = bulletEntity.getComponent(Transform);
    this.broadcast(new Messages.Spawn(
      bulletEntity.id,
      Types.Entities.BULLET,
      position,
      rotation,
      scale
    ));
  }

  broadcast(message, ignoredPlayerId = null) {
    for (const [id, entity] of this.clients.entries()) {
      if (id == ignoredPlayerId || !entity || !entity.alive || entity.hasComponent(Destroy) ||
          !entity.hasComponent(Connection)) {
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
