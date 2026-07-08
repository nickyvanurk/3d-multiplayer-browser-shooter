import { Vector3 } from 'three';

import logger from '../utils/logger.js';
import Utils from '../../../shared/utils.js';
import Types from '../../../shared/types.js';
import Messages from '../../../shared/messages.js';

import { Ship } from '../../../shared/sim/entities/ship.js';
import { Weapon } from '../../../shared/sim/weapon.js';
import { InputCommand } from '../../../shared/sim/input.js';
import { SnapshotDiffer } from '../../../shared/sim/net/snapshot.js';

import type { GameServer } from '../game-server.js';
import type Connection from '../connection.js';
import type { OutgoingMessage } from '../connection.js';
import type { World } from '../../../shared/sim/world.js';
import type { Entity } from '../../../shared/sim/entity.js';

export class NetworkServer {
  gameServer: GameServer;
  world: World;
  connections: Set<Connection>;
  ships: Map<number, Ship>;
  differ: SnapshotDiffer;
  lastAlive: Map<number, boolean>;

  constructor(gameServer: GameServer) {
    this.gameServer = gameServer;
    this.world = gameServer.world;
    this.connections = new Set();
    this.ships = new Map(); // connection.id -> Ship
    this.differ = new SnapshotDiffer();
    this.lastAlive = new Map(); // ship id -> boolean
  }

  addConnection(connection: Connection): void {
    this.connections.add(connection);
    connection.onDisconnect(() => this.handleDisconnect(connection));

    connection.pushMessage(new Messages.Go());

    for (const entity of this.world.entities.values()) {
      if (entity.alive === false) {
        continue;
      }
      const { position, rotation, scale } = entity.transform;
      connection.pushMessage(
        new Messages.Spawn(entity.id!, entity.type, position, rotation, scale),
      );
    }

    connection.sendOutgoingMessages();
  }

  handleDisconnect(connection: Connection): void {
    const ship = this.ships.get(connection.id);
    if (ship) {
      logger.debug(`Deleting player${connection.id}`);
      this.world.despawn(ship.id!);
      this.ships.delete(connection.id);
      this.lastAlive.delete(ship.id!);
    }

    this.connections.delete(connection);
    this.gameServer.connectedClients--;
  }

  processIncoming(world: World, _time: number): void {
    for (const connection of this.connections) {
      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message!.type) {
          case Types.Messages.HELLO: {
            let name = Utils.sanitize(message!.data.name);
            name = !name ? 'UNKNOWN' : name.substr(0, 15);

            const ship = this.spawnShip(world, connection);
            connection.pushMessage(new Messages.Welcome(ship.id!, name));
            break;
          }
        }
      }

      if (connection.hasInputs()) {
        let input = connection.popInput();

        while (input && input.seq < connection.lastProcessedInput + 1) {
          input = connection.popInput();
        }

        if (!input) {
          continue;
        }

        const ship = this.ships.get(connection.id);
        if (ship && ship.controller) {
          ship.controller.lastInput = new InputCommand(input.data, input.seq);
        }
      }

      connection.lastProcessedInput++;
    }
  }

  spawnShip(world: World, connection: Connection): Ship {
    logger.debug('Spawning spaceship');

    const ship = new Ship();

    const weaponLeft = new Weapon({
      offset: new Vector3(1.3, 0.9, 5),
      delay: 125,
      fireInterval: 250,
    });
    const weaponRight = new Weapon({
      offset: new Vector3(-1.3, 0.9, 5),
      fireInterval: 250,
    });
    weaponLeft.parent = ship;
    weaponRight.parent = ship;
    ship.weapons = [weaponLeft, weaponRight];

    ship.controller = { connection, lastInput: InputCommand.empty() };

    // Place the ship before spawning: world.spawn() synchronously builds the
    // physics body from the ship's transform, so the scatter must happen first
    // (mirrors the old SpawnSystem-before-PhysicsSystem order). spawnArea 10
    // matches the original SpawnSystem.
    ship.transform.position = Utils.getRandomPosition(10);
    ship.randomSpawn = false;

    world.spawn(ship);
    this.ships.set(connection.id, ship);

    return ship;
  }

  onEntitySpawned(entity: Entity): void {
    if (entity.alive === false) {
      return;
    }

    const { position, rotation, scale } = entity.transform;
    logger.debug(`Broadcast: Spawn entity#${entity.id}`);
    this.broadcastMessage(
      new Messages.Spawn(entity.id!, entity.type, position, rotation, scale),
    );
  }

  onEntityDespawned(entity: Entity): void {
    logger.debug(`Broadcast: Despawn entity#${entity.id}`);
    this.broadcastMessage(new Messages.Despawn(entity.id!));
  }

  broadcast(world: World, _time: number): void {
    for (const entity of world.entities.values()) {
      if (typeof entity.alive !== 'boolean') {
        continue;
      }

      const was = this.lastAlive.get(entity.id!);

      if (was === undefined) {
        this.lastAlive.set(entity.id!, entity.alive);
        continue;
      }

      if (was && !entity.alive) {
        this.broadcastMessage(new Messages.Despawn(entity.id!));
      } else if (!was && entity.alive) {
        const { position, rotation, scale } = entity.transform;
        this.broadcastMessage(
          new Messages.Spawn(
            entity.id!,
            entity.type,
            position,
            rotation,
            scale,
          ),
        );
      }

      this.lastAlive.set(entity.id!, entity.alive);
    }

    for (const id of this.lastAlive.keys()) {
      if (!world.entities.has(id)) {
        this.lastAlive.delete(id);
      }
    }

    const changed = this.differ.changed(world).filter((c) => {
      const entity = world.get(c.id);
      return entity && entity.alive !== false;
    });

    if (changed.length) {
      const message = new Messages.World(changed);
      for (const connection of this.connections) {
        connection.pushMessage(message);
      }
    }

    for (const connection of this.connections) {
      connection.sendOutgoingMessages();
    }
  }

  broadcastMessage(
    message: OutgoingMessage,
    ignoredId: number | null = null,
  ): void {
    for (const connection of this.connections) {
      if (connection.id !== ignoredId) {
        connection.pushMessage(message);
      }
    }
  }
}
