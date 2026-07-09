import logger from '../utils/logger.ts';
import Utils from '../../../shared/utils.ts';

import {
  Ship,
  createDefaultWeapons,
} from '../../../shared/sim/entities/ship.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import { pickSpawnPosition } from '../../../shared/sim/spawn.ts';
import type { World } from '../../../shared/sim/world.ts';

import type { GameServer } from '../game-server.ts';
import { BotController } from './bot-controller.ts';
import { pickProfile } from './bot-profile.ts';

// Keep the world topped up to a target headcount with AI bots, backfilling when
// humans are scarce and yielding as they join. Bots are ordinary Ship entities
// with no connection — they replicate, take damage, die and respawn through the
// existing paths untouched.
const DEFAULT_TARGET_SHIP_COUNT = 6;
const DEFAULT_MAX_BOTS = 8;
// Reconcile at a slow cadence (not every 60 Hz tick) and change headcount
// gradually so the roster doesn't churn.
const RECONCILE_INTERVAL_MS = 1000;
const MAX_CHANGE_PER_RECONCILE = 2;

export class BotManager {
  private gameServer: GameServer;
  private targetShipCount: number;
  private maxBots: number;
  private bots: BotController[];
  private nextSeed: number;
  private lastReconcileAt: number;

  constructor(
    gameServer: GameServer,
    targetShipCount = Number(process.env.TARGET_SHIP_COUNT) ||
      DEFAULT_TARGET_SHIP_COUNT,
    maxBots = Number(process.env.MAX_BOTS) || DEFAULT_MAX_BOTS,
  ) {
    this.gameServer = gameServer;
    this.targetShipCount = targetShipCount;
    this.maxBots = maxBots;
    this.bots = [];
    this.nextSeed = 1;
    this.lastReconcileAt = -Infinity;
  }

  // Live bot controllers — for diagnostics/telemetry.
  get controllers(): readonly BotController[] {
    return this.bots;
  }

  // Adjust the bot roster toward `target - humans`, a few at a time. Rate-limited
  // internally, so it is safe to call every tick.
  reconcile(time: number): void {
    if (time - this.lastReconcileAt < RECONCILE_INTERVAL_MS) {
      return;
    }
    this.lastReconcileAt = time;

    const humans = this.gameServer.network.ships.size;
    const wanted = Math.max(
      0,
      Math.min(this.maxBots, this.targetShipCount - humans),
    );

    let delta = wanted - this.bots.length;
    delta = Math.max(
      -MAX_CHANGE_PER_RECONCILE,
      Math.min(MAX_CHANGE_PER_RECONCILE, delta),
    );

    for (let i = 0; i < delta; i++) {
      this.spawnBot(this.gameServer.world);
    }
    for (let i = 0; i > delta; i--) {
      this.despawnBot(this.gameServer.world);
    }
  }

  update(world: World, dt: number, time: number): void {
    for (const bot of this.bots) {
      bot.think(world, dt, time);
    }
  }

  private spawnBot(world: World): void {
    const rng = Utils.randomNumberGenerator(this.nextSeed++);

    const ship = new Ship();
    // No connection: a bot consumes no player slot and no socket path touches it.
    ship.controller = { lastInput: InputCommand.empty() };
    // Self-simulated: the bot ship runs the real thrust/torque physics from its
    // own input (like a client-owned ship), instead of being mirrored via
    // correctBody. This is what makes it fly with true player speed/turn/momentum.
    ship.selfSimulated = true;
    // Unlike server player-ships (which fire only from client Fire messages), the
    // bot ship carries real weapons so its own Ship.update loop spawns bullets.
    ship.weapons = createDefaultWeapons(ship);
    // Scatter across the field, clear of asteroids and away from other ships,
    // using the bot's seeded RNG so the spawn stays deterministic.
    ship.transform.position = pickSpawnPosition(world, rng);
    ship.randomSpawn = false;

    world.spawn(ship); // onSpawn: physics body + Spawn broadcast to all clients

    const profile = pickProfile(rng);
    this.bots.push(new BotController(ship, profile, rng));
    logger.debug(
      `Spawned ${profile.name} bot ship#${ship.id} (${this.bots.length} bots)`,
    );
  }

  private despawnBot(world: World): void {
    const bot = this.bots.pop();
    if (!bot) {
      return;
    }
    world.despawn(bot.ship.id!); // onDespawn: remove body + Despawn broadcast
    logger.debug(
      `Despawned bot ship#${bot.ship.id} (${this.bots.length} bots)`,
    );
  }
}
