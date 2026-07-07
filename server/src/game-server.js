import { performance } from 'perf_hooks';

import logger from './utils/logger.js';
import Utils from '../../shared/utils.js';

import { World } from '../../shared/sim/world.js';
import { AmmoPhysicsWorld } from './physics/ammo-physics-world.js';
import { NetworkServer } from './net/network-server.js';
import { RespawnSubsystem } from '../../shared/sim/subsystems/respawn.js';
import { CombatSubsystem } from '../../shared/sim/subsystems/combat.js';
import { Asteroid } from '../../shared/sim/entities/asteroid.js';

export class GameServer {
  constructor(id, maxClients, server, physicsWorld = new AmmoPhysicsWorld()) {
    this.id = id;
    this.maxClients = maxClients;
    this.connectedClients = 0;
    this.server = server;
    this.updatesPerSecond = 60;
    this.lastTime = performance.now();

    this.asteroidFieldSize = 4000;

    this.world = new World();
    this.physics = physicsWorld;
    this.world.physics = this.physics;

    // NetworkServer owns connections and broadcasts snapshots.
    this.network = new NetworkServer(this);

    // AmmoPhysicsWorld creates/removes Ammo bodies on spawn/despawn; NetworkServer
    // broadcasts the matching Spawn/Despawn to clients.
    this.world.onSpawn = (entity) => {
      this.physics.add(entity);
      this.network.onEntitySpawned(entity);
    };
    this.world.onDespawn = (entity) => {
      this.physics.remove(entity);
      this.network.onEntityDespawned(entity);
    };

    // Addendum order: respawn runs before combat so a ship killed this tick
    // begins its countdown next tick.
    this.world
      .addSubsystem(new RespawnSubsystem())
      .addSubsystem(new CombatSubsystem());

    logger.info(`${this.id} running`);
  }

  async init() {
    // Physics loads Ammo + collision meshes async; only start the loop and
    // populate the asteroid field once bodies can actually be built.
    await this.physics.init();
    this.spawnAsteroids(500);

    this.fixedUpdate = Utils.createFixedTimestep(
      1000/this.updatesPerSecond,
      this.handleFixedUpdate.bind(this)
    );
    setInterval(this.update.bind(this), 1000/this.updatesPerSecond);

    logger.info(`${this.id} simulation started`);
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
    this.tick(delta, time);
  }

  tick(dt, time) {
    // 0. Drain incoming messages/inputs before the sim steps (Hello -> ship
    //    spawn, latest input copied onto each ship's controller).
    this.network.processIncoming(this.world, time);

    // 1. Entity behaviour (control, weapon firing). Snapshot the values so
    //    entities spawned mid-tick (e.g. bullets) wait for the next tick.
    for (const e of [...this.world.entities.values()]) {e.update(dt, this.world, time);}

    // 2. Physics: apply controls/forces, integrate, collect collisions.
    this.physics.applyAll?.(this.world, dt);
    this.physics.step(dt);

    // 3. Subsystems: respawn, then combat (reads drained collisions).
    for (const s of this.world.subsystems) {s.update(this.world, dt, time);}

    // 4. Reap destroyed entities.
    this.world.reap();

    // 5. Broadcast alive-transitions + snapshot diff to every connection.
    this.network.broadcast(this.world, time);
  }

  handlePlayerConnect(connection) {
    logger.debug(`Adding player${connection.id} to ${this.id}`);

    this.connectedClients++;
    this.network.addConnection(connection);
  }

  spawnAsteroids(count) {
    const rng = Utils.randomNumberGenerator(1);

    for (let i = 0; i < count; ++i) {
      const position = Utils.getRandomPosition(this.asteroidFieldSize, rng);
      const rotation = Utils.getRandomQuaternion(rng);

      const scaleValue = [1, 5, 10, 20, 40, 60, 120, /*240, /*560*/];
      const scale = scaleValue[Math.floor(rng() * scaleValue.length)];

      // Task 14: AmmoPhysicsWorld builds the collision shape/body (via onSpawn).
      this.world.spawn(new Asteroid({ transform: { position, rotation }, scale }));
    }
  }
}
