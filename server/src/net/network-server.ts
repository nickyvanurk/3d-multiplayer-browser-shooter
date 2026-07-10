import logger from '../utils/logger.ts';
import { sanitize } from '../utils/sanitize.ts';
import Types from '../../../shared/types.ts';
import Messages from '../../../shared/messages.ts';

import { Ship } from '../../../shared/sim/entities/ship.ts';
import { Bullet } from '../../../shared/sim/entities/bullet.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import { SnapshotDiffer } from '../../../shared/sim/net/snapshot.ts';
import { pickSpawnPosition } from '../../../shared/sim/spawn.ts';
import { sellCargo, repairShip } from '../../../shared/sim/trade.ts';
import { generateName } from '../../../shared/names/generate-name.ts';
import type {
  SpawnEvent,
  CollectEvent,
} from '../../../shared/sim/subsystems/mining.ts';

import type { GameServer } from '../game-server.ts';
import type Connection from '../connection.ts';
import type { OutgoingMessage } from '../connection.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';

export class NetworkServer {
  gameServer: GameServer;
  world: World;
  connections: Set<Connection>;
  ships: Map<number, Ship>;
  differ: SnapshotDiffer;
  lastAlive: Map<number, boolean>;
  // Last cargo/credits sent to each owner, so Stats only goes out on a change.
  lastStats: Map<number, { cargo: number; credits: number }>;

  constructor(gameServer: GameServer) {
    this.gameServer = gameServer;
    this.world = gameServer.world;
    this.connections = new Set();
    this.ships = new Map(); // connection.id -> Ship
    this.differ = new SnapshotDiffer();
    this.lastAlive = new Map(); // ship id -> boolean
    this.lastStats = new Map(); // connection.id -> { cargo, credits }
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
      const name = (entity as { name?: string }).name ?? '';
      connection.pushMessage(
        new Messages.Spawn(
          entity.id!,
          entity.type,
          position,
          rotation,
          scale,
          name,
        ),
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

    this.lastStats.delete(connection.id);
    this.connections.delete(connection);
    this.gameServer.connectedClients--;
  }

  processIncoming(world: World, _time: number): void {
    for (const connection of this.connections) {
      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message!.type) {
          case Types.Messages.HELLO: {
            const cleaned = sanitize(message!.data.name);
            // No name given → hand out a random callsign so every ship is named.
            const name = cleaned ? cleaned.substr(0, 15) : generateName();

            const ship = this.spawnShip(world, connection, name);
            connection.pushMessage(new Messages.Welcome(ship.id!, name));
            break;
          }
        }
      }

      const ship = this.ships.get(connection.id);
      if (!ship) {
        continue;
      }

      // Client-authoritative movement: when a fresh State arrives, snap the
      // ship's dynamic body to the reported pose+velocity. Between States the
      // body coasts and collides with other ships (bumps) under physics.
      // Draining clears it so a state-less tick coasts rather than re-snapping.
      const state = connection.drainState();
      if (state && ship.alive !== false) {
        // Carry the owner's reported thrust input so it re-broadcasts to other
        // clients (remote engine visuals / dead reckoning).
        ship.inputBits = state.input;
        this.gameServer.physics.correctBody?.(
          ship,
          state.position,
          state.rotation,
          state.velocity,
          state.angularVelocity,
        );
      }

      // Each Fire request spawns the authoritative bullet the server owns for
      // damage/kills. The client already shows a predicted one, so it doesn't
      // receive this bullet back (see onEntitySpawned / broadcast).
      for (const fire of connection.drainFire()) {
        if (ship.alive === false) {
          break;
        }
        this.spawnBullet(world, ship, fire);
      }

      // Vendor trades: server-authoritative sell/repair, gated on docking range
      // inside trade.ts. Flags are drained every tick to clear them even when
      // dead or the vendor is somehow absent.
      const wantsSell = connection.drainSell();
      const wantsRepair = connection.drainRepair();
      if (ship.alive !== false && (wantsSell || wantsRepair)) {
        const vendor = this.findVendor();
        if (vendor) {
          if (wantsSell) {
            sellCargo(ship, vendor);
          }
          if (wantsRepair) {
            repairShip(ship, vendor);
          }
        }
      }
    }
  }

  // The single neutral vendor NPC, or undefined if it is not in the world.
  private findVendor(): Entity | undefined {
    for (const entity of this.world.entities.values()) {
      if (entity.type === Types.Entities.VENDOR) {
        return entity;
      }
    }
    return undefined;
  }

  // Server -> all: one OreDrop per freshly-broken chunk (id + impact position),
  // so every client renders it at the same spot.
  broadcastSpawned(events: SpawnEvent[]): void {
    for (const { id, position } of events) {
      this.broadcastMessage(new Messages.OreDrop(id, position));
    }
  }

  // Server -> all: one Collect per authoritatively-collected chunk, so every
  // client drops its copy.
  broadcastCollected(events: CollectEvent[]): void {
    for (const { id } of events) {
      this.broadcastMessage(new Messages.Collect(id));
    }
  }

  // Server -> owner only: push the owner's cargo/credits when either changed
  // (from a collect or a sell). Kept off the shared snapshot — only the owning
  // HUD needs them.
  private sendStatChanges(): void {
    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id);
      if (!ship) {
        continue;
      }
      const last = this.lastStats.get(connection.id);
      if (last && last.cargo === ship.cargo && last.credits === ship.credits) {
        continue;
      }
      connection.pushMessage(
        new Messages.Stats(ship.cargo, ship.cargoCapacity, ship.credits),
      );
      this.lastStats.set(connection.id, {
        cargo: ship.cargo,
        credits: ship.credits,
      });
    }
  }

  spawnShip(world: World, connection: Connection, name = ''): Ship {
    logger.debug('Spawning spaceship');

    const ship = new Ship();
    // Set before world.spawn: spawning synchronously broadcasts Spawn (with the
    // name), so it must be assigned first.
    ship.name = name;

    // The server ship is a DYNAMIC body: its pose is snapped to the owning
    // client's State (client-authoritative movement), but between States it
    // coasts and physically collides with other ships so ship-vs-ship bumps
    // resolve on the server. It still fires no weapons (bullets come from Fire
    // events); the controller only carries the connection for bullet ownership.
    ship.controller = { connection, lastInput: InputCommand.empty() };

    // Place the ship before spawning: world.spawn() synchronously builds the
    // physics body from the ship's transform, so the spawn point must be chosen
    // first. Scatter across the field, clear of asteroids and away from other
    // ships, rather than piling everyone onto the origin.
    ship.transform.position = pickSpawnPosition(world);
    ship.randomSpawn = false;

    world.spawn(ship);
    this.ships.set(connection.id, ship);

    return ship;
  }

  spawnBullet(
    world: World,
    ship: Ship,
    fire: ReturnType<typeof Messages.Fire.deserialize>,
  ): void {
    const bullet = new Bullet({
      transform: { position: fire.position, rotation: fire.rotation },
      damage: fire.damage,
    });
    bullet.owner = ship;
    // world.spawn -> onSpawn: physics body + onEntitySpawned broadcast.
    world.spawn(bullet);
  }

  // The connection id of a bullet's owner, or null for non-bullets. Used to keep
  // a client from receiving the authoritative copy of a bullet it predicted.
  bulletOwnerId(entity: Entity | undefined): number | null {
    if (!entity || entity.type !== Types.Entities.BULLET) {
      return null;
    }
    const owner = (entity as Bullet).owner as Ship | null;
    const connection = owner?.controller?.connection as Connection | undefined;
    return connection ? connection.id : null;
  }

  onEntitySpawned(entity: Entity): void {
    if (entity.alive === false) {
      return;
    }

    const { position, rotation, scale } = entity.transform;
    const name = (entity as { name?: string }).name ?? '';
    logger.debug(`Broadcast: Spawn entity#${entity.id}`);
    this.broadcastMessage(
      new Messages.Spawn(
        entity.id!,
        entity.type,
        position,
        rotation,
        scale,
        name,
      ),
      this.bulletOwnerId(entity),
    );
  }

  onEntityDespawned(entity: Entity): void {
    logger.debug(`Broadcast: Despawn entity#${entity.id}`);
    // Owner exclusion is unnecessary here: despawning an id the client never had
    // is a harmless no-op on its side.
    this.broadcastMessage(new Messages.Despawn(entity.id!));
  }

  broadcast(world: World, _time: number): void {
    this.sendStatChanges();

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
        const name = (entity as { name?: string }).name ?? '';
        this.broadcastMessage(
          new Messages.Spawn(
            entity.id!,
            entity.type,
            position,
            rotation,
            scale,
            name,
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
      for (const connection of this.connections) {
        // Exclude a client's own authoritative bullets — it already renders the
        // predicted ones it fired. (Non-bullets have owner id null, so they pass.)
        const relevant = changed.filter(
          (c) => this.bulletOwnerId(world.get(c.id)) !== connection.id,
        );
        if (relevant.length) {
          connection.pushMessage(new Messages.World(relevant));
        }
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
