import { performance } from 'perf_hooks';

import logger from '../utils/logger.ts';
import { sanitize } from '../utils/sanitize.ts';
import Types from '../../../shared/types.ts';
import Messages from '../../../shared/messages.ts';

import { Ship, maxWeaponDamage } from '../../../shared/sim/entities/ship.ts';
import {
  DEFAULT_BULLET_SPEED,
  DEFAULT_BULLET_TIMER,
} from '../../../shared/sim/entities/bullet.ts';
import {
  applyDamage,
  type CombatEntity,
} from '../../../shared/sim/subsystems/combat.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import { SnapshotDiffer } from '../../../shared/sim/net/snapshot.ts';
import { pickSpawnPosition } from '../../../shared/sim/spawn.ts';
import {
  sellCargo,
  repairShip,
  buyMiningLaser,
  equipSlot,
} from '../../../shared/sim/trade.ts';
import { Items, MINING_LASER_FACTOR } from '../../../shared/sim/mining.ts';
import { xpForNextLevel } from '../../../shared/sim/progression.ts';
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

// A bullet's max reach in world units is speed(units/ms) × lifetime(ms). A
// reported Hit whose impact is farther than that from the shooter is impossible,
// so reject it; the slack covers the shooter's own motion + the visual muzzle
// offset.
const MAX_HIT_RANGE = DEFAULT_BULLET_SPEED * DEFAULT_BULLET_TIMER * 1.5;

// How many top pilots the leaderboard carries, and how many 60 Hz ticks between
// leaderboard pushes (~3 Hz).
const LEADERBOARD_SIZE = 10;
const LEADERBOARD_INTERVAL = 20;

export class NetworkServer {
  gameServer: GameServer;
  world: World;
  connections: Set<Connection>;
  ships: Map<number, Ship>;
  differ: SnapshotDiffer;
  lastAlive: Map<number, boolean>;
  // Last cargo/credits sent to each owner, so Stats only goes out on a change.
  lastStats: Map<number, { cargo: number; credits: number }>;
  // Last credits/loadout sent to each owner, so Loadout only goes out on a change.
  lastLoadout: Map<
    number,
    {
      hasMiningLaser: boolean;
      primaryItem: number;
      secondaryItem: number;
    }
  >;
  // Last level/xp sent to each owner, so Progress only goes out on a change.
  lastProgress: Map<number, { level: number; xp: number }>;
  // Ticks since the last leaderboard broadcast — it goes out every
  // LEADERBOARD_INTERVAL ticks (~3 Hz) rather than every 60 Hz tick.
  private leaderboardTick: number;

  constructor(gameServer: GameServer) {
    this.gameServer = gameServer;
    this.world = gameServer.world;
    this.connections = new Set();
    this.ships = new Map(); // connection.id -> Ship
    this.differ = new SnapshotDiffer();
    this.lastAlive = new Map(); // ship id -> boolean
    this.lastStats = new Map(); // connection.id -> { cargo, credits }
    this.lastLoadout = new Map(); // connection.id -> { hasMiningLaser, primaryItem, secondaryItem }
    this.lastProgress = new Map(); // connection.id -> { level, xp }
    this.leaderboardTick = 0;
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
    this.lastLoadout.delete(connection.id);
    this.lastProgress.delete(connection.id);
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

      // Client-side hit detection: bullets no longer exist server-side. Each Fire
      // is just a muzzle — relay it to OTHER clients as a cosmetic Shot they
      // simulate locally (the shooter already predicts its own).
      for (const fire of connection.drainFire()) {
        if (ship.alive === false) {
          break;
        }
        this.broadcastMessage(
          new Messages.Shot(ship.id!, fire.position, fire.rotation, fire.speed),
          connection.id,
        );
      }

      // Each Hit is the shooter's raycast striking a target; validate + apply the
      // damage (health/kills stay server-authoritative).
      for (const hit of connection.drainHits()) {
        if (ship.alive === false) {
          break;
        }
        this.applyHit(ship, hit);
      }

      // Vendor trades: server-authoritative sell/repair, gated on docking range
      // inside trade.ts. Flags are drained every tick to clear them even when
      // dead or the vendor is somehow absent.
      const wantsSell = connection.drainSell();
      const wantsRepair = connection.drainRepair();
      const wantsBuy = connection.drainBuy();
      const wantsEquip = connection.drainEquip();
      if (
        ship.alive !== false &&
        (wantsSell || wantsRepair || wantsBuy !== null || wantsEquip !== null)
      ) {
        const vendor = this.findVendor();
        if (vendor) {
          if (wantsSell) {
            sellCargo(ship, vendor);
          }
          if (wantsRepair) {
            repairShip(ship, vendor);
          }
          if (wantsBuy === Items.MINING_LASER) {
            buyMiningLaser(ship, vendor);
          }
          if (wantsEquip !== null) {
            equipSlot(ship, wantsEquip.slot, wantsEquip.itemId, vendor);
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

  // Server -> owner only: push the owner's item ownership + equipped weapons when
  // any changed (buy/equip), and once on spawn so the client builds the right
  // weapons from the start. Credits are handled by sendStatChanges, so a credit
  // change alone does NOT re-send this (which would needlessly rebuild weapons).
  private sendLoadoutChanges(): void {
    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id);
      if (!ship) {
        continue;
      }
      const last = this.lastLoadout.get(connection.id);
      if (
        last &&
        last.hasMiningLaser === ship.hasMiningLaser &&
        last.primaryItem === ship.primaryItem &&
        last.secondaryItem === ship.secondaryItem
      ) {
        continue;
      }
      connection.pushMessage(
        new Messages.Loadout(
          ship.hasMiningLaser,
          ship.primaryItem,
          ship.secondaryItem,
        ),
      );
      this.lastLoadout.set(connection.id, {
        hasMiningLaser: ship.hasMiningLaser,
        primaryItem: ship.primaryItem,
        secondaryItem: ship.secondaryItem,
      });
    }
  }

  // Server -> owner only: push the owner's level/xp when either changed (a kill
  // banked XP, or a respawn reset it), so the HUD badge + XP bar track it. Sends
  // xpForNext so the client fills the bar without duplicating the curve.
  private sendProgressChanges(): void {
    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id);
      if (!ship) {
        continue;
      }
      const last = this.lastProgress.get(connection.id);
      if (last && last.level === ship.level && last.xp === ship.xp) {
        continue;
      }
      connection.pushMessage(
        new Messages.Progress(ship.level, ship.xp, xpForNextLevel(ship.level)),
      );
      this.lastProgress.set(connection.id, { level: ship.level, xp: ship.xp });
    }
  }

  // Server -> each client (throttled): the top LEADERBOARD_SIZE pilots plus the
  // recipient's own rank. Ranks every alive ship (players + bots) by level desc,
  // then xp desc. Tailored per recipient (selfRank differs), so it's pushed
  // per-connection rather than broadcast.
  private sendLeaderboard(): void {
    if (this.connections.size === 0) {
      return;
    }

    const ranked: Ship[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.type === Types.Entities.SPACESHIP && entity.alive !== false) {
        ranked.push(entity as Ship);
      }
    }
    ranked.sort((a, b) => b.level - a.level || b.xp - a.xp);

    const top = ranked.slice(0, LEADERBOARD_SIZE).map((s) => ({
      name: s.name,
      level: s.level,
    }));

    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id);
      if (!ship) {
        continue;
      }
      // +1 for a 1-based rank; 0 (unranked) only if the ship somehow isn't listed.
      const selfRank = ranked.indexOf(ship) + 1;
      connection.pushMessage(
        new Messages.Leaderboard(top, selfRank, ship.level),
      );
    }
  }

  spawnShip(world: World, connection: Connection, name = ''): Ship {
    logger.debug('Spawning spaceship');

    const ship = new Ship();
    // Set before world.spawn: spawning synchronously broadcasts Spawn (with the
    // name), so it must be assigned first.
    ship.name = name;

    // TESTING: hand every player the mining laser, owned and mounted in the
    // secondary (RMB) slot, so the beam is available without a vendor visit.
    ship.hasMiningLaser = true;
    ship.secondaryItem = Items.MINING_LASER;

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

  // Client-reported hit: validate the shooter's claim and apply the damage. The
  // client already ran the raycast; the server owns health/kills and clamps the
  // numbers so a tampered client can't inflate damage or fake an out-of-reach hit.
  applyHit(ship: Ship, hit: ReturnType<typeof Messages.Hit.deserialize>): void {
    const target = this.world.get(hit.targetId) as CombatEntity | undefined;
    if (!target || target.alive === false || target.invulnerable) {
      return;
    }

    // Reject an impact beyond any bullet's reach from the shooter.
    if (ship.transform.position.distanceTo(hit.position) > MAX_HIT_RANGE) {
      return;
    }

    // A laser factor is honoured only if the ship actually owns and mounts the
    // mining laser (in either slot). The client's miningFactor is a mere "this is a
    // laser shot" flag — the server substitutes its OWN authoritative magnitude, so
    // a tampered client can't send a huge factor and one-shot rocks.
    const laserEquipped =
      ship.hasMiningLaser &&
      (ship.primaryItem === Items.MINING_LASER ||
        ship.secondaryItem === Items.MINING_LASER);
    const miningFactor =
      laserEquipped && hit.miningFactor ? MINING_LASER_FACTOR : undefined;

    // Clamp damage to what the ship's real weapons can deal; the ship is credited
    // for the kill (progression's lastHitBy).
    const damage = Math.min(hit.damage, maxWeaponDamage(ship));
    applyDamage(target, damage, miningFactor, hit.position, ship);
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
    this.sendLoadoutChanges();
    this.sendProgressChanges();

    // Leaderboard is throttled: standings change slowly relative to the 60 Hz
    // tick, so pushing it a few times a second is plenty and keeps the wire lean.
    if (++this.leaderboardTick >= LEADERBOARD_INTERVAL) {
      this.leaderboardTick = 0;
      this.sendLeaderboard();
    }

    // Stamp this snapshot with the server wall clock — the SAME clock the PING
    // handler echoes in its PONG — so the client's synced clock and the snapshot
    // timestamps share one domain (age = serverNow() - serverTime). One value
    // per tick, shared by every connection.
    const now = performance.now();

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
        // A player ship coming back from the dead is re-Spawned to clients, which
        // rebuild it from defaults (0 cargo/credits, no secondary weapon). Force a
        // fresh Stats + Loadout by dropping the "last sent" record, so its economy
        // and equipped mining laser re-sync instead of reading blank until the
        // next change. (Bots have no connection, so this skips them.)
        const owner = (entity as Ship).controller?.connection as
          | Connection
          | undefined;
        if (owner) {
          this.lastStats.delete(owner.id);
          this.lastLoadout.delete(owner.id);
        }
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
      // Bullets no longer exist server-side (except bots'), so there's nothing to
      // exclude per-connection: every client gets the same snapshot.
      const snapshot = new Messages.World(changed, now);
      for (const connection of this.connections) {
        connection.pushMessage(snapshot);
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
