import assert from 'node:assert/strict';
import { test } from './harness.ts';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import Types from '../../shared/types.ts';
import Utils from '../../shared/utils.ts';
import { BotController } from '../../server/src/ai/bot-controller.ts';
import { BotManager } from '../../server/src/ai/bot-manager.ts';
import { MEDIUM } from '../../server/src/ai/bot-profile.ts';

function countShips(world: World): number {
  let n = 0;
  for (const e of world.entities.values()) {
    if (e.type === Types.Entities.SPACESHIP) {
      n++;
    }
  }
  return n;
}

// The bot only produces control input; the ship's physics flies it (not exercised
// here). We assert the input: it steers toward the target and eventually fires.
test('bot aims at and fires on a target dead ahead in range', () => {
  const world = new World();
  const bot = new Ship();
  bot.transform.position.set(0, 0, 0); // facing +Z (identity rotation)
  const enemy = new Ship();
  enemy.transform.position.set(0, 0, 200); // dead ahead, inside fire range
  world.spawn(bot);
  world.spawn(enemy);

  const ctrl = new BotController(bot, MEDIUM, Utils.randomNumberGenerator(1));

  const dt = 1000 / 60;
  let fired = false;
  let time = 0;
  for (let i = 0; i < 180; i++) {
    ctrl.think(world, dt, time);
    if (bot.controller?.lastInput.weaponPrimary) {
      fired = true;
    }
    time += dt;
  }

  const aim = bot.controller?.lastInput.aim;
  assert.ok(aim, 'expected an aim/steer command');
  // Guns point toward the +Z enemy.
  assert.ok(aim!.direction.z > 0.5, `expected aim toward +Z enemy, got ${aim!.direction.z}`);
  // Already lined up on a dead-ahead target: almost no steering deflection.
  assert.ok(Math.abs(aim!.mouse.x) < 0.2, `expected small yaw input, got ${aim!.mouse.x}`);
  // It commits and opens fire within a couple of seconds.
  assert.ok(fired, 'expected the bot to fire at a dead-ahead target');
});

test('bot steers toward a target off to one side', () => {
  const world = new World();
  const bot = new Ship();
  bot.transform.position.set(0, 0, 0);
  const enemy = new Ship();
  enemy.transform.position.set(150, 0, 150); // ahead and to the +X side
  world.spawn(bot);
  world.spawn(enemy);

  const ctrl = new BotController(bot, MEDIUM, Utils.randomNumberGenerator(3));
  ctrl.think(world, 1000 / 60, 0);

  const aim = bot.controller?.lastInput.aim;
  assert.ok(aim, 'expected a steer command');
  // Target on the +X side → non-trivial yaw deflection toward it.
  assert.ok(Math.abs(aim!.mouse.x) > 0.3, `expected a yaw turn, got ${aim!.mouse.x}`);
});

test('bot ignores a target outside detection range', () => {
  const world = new World();
  const bot = new Ship();
  bot.transform.position.set(0, 0, 0);
  const enemy = new Ship();
  enemy.transform.position.set(0, 0, MEDIUM.detectionRange + 500);
  world.spawn(bot);
  world.spawn(enemy);

  const ctrl = new BotController(bot, MEDIUM, Utils.randomNumberGenerator(2));
  let time = 0;
  for (let i = 0; i < 60; i++) {
    ctrl.think(world, 1000 / 60, time);
    time += 1000 / 60;
    assert.ok(
      !bot.controller?.lastInput.weaponPrimary,
      'must not fire at an out-of-range target',
    );
  }
});

test('bot ships are flagged self-simulated so physics flies them', () => {
  const world = new World();
  const gameServer = { world, network: { ships: new Map() } };
  const mgr = new BotManager(gameServer as never, 2, 4);
  mgr.reconcile(0);
  for (const e of world.entities.values()) {
    if (e.type === Types.Entities.SPACESHIP) {
      assert.equal(e.selfSimulated, true, 'bot ships must be self-simulated');
    }
  }
});

test('BotManager fills to target headcount and yields to humans', () => {
  const ships = new Map<number, unknown>();
  const world = new World();
  const gameServer = { world, network: { ships } };
  const mgr = new BotManager(gameServer as never, 4, 8);

  mgr.reconcile(0);
  assert.equal(countShips(world), 2);
  mgr.reconcile(1000);
  assert.equal(countShips(world), 4);
  mgr.reconcile(2000);
  assert.equal(countShips(world), 4, 'holds at the target');

  ships.set(1, {});
  ships.set(2, {});
  ships.set(3, {});
  ships.set(4, {});
  mgr.reconcile(3000);
  assert.equal(countShips(world), 2);
  mgr.reconcile(4000);
  assert.equal(countShips(world), 0, 'all bots yield when the world is full of humans');
});

test('BotManager reconcile is rate-limited between calls', () => {
  const world = new World();
  const gameServer = { world, network: { ships: new Map() } };
  const mgr = new BotManager(gameServer as never, 6, 8);

  mgr.reconcile(0);
  assert.equal(countShips(world), 2);
  mgr.reconcile(500);
  assert.equal(countShips(world), 2);
});
