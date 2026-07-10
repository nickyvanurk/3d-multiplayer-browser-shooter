import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { Bullet } from '../../shared/sim/entities/bullet.ts';
import { CombatSubsystem } from '../../shared/sim/subsystems/combat.ts';
import {
  ASTEROID_RESPAWN_DELAY,
  MINING_DAMAGE_FACTOR,
} from '../../shared/sim/mining.ts';
import { asteroidMaxOre } from '../../shared/sim/mining.ts';
import { test } from './harness.ts';

test('a fresh asteroid is a full-ore, alive, in-place-respawning static body', () => {
  const asteroid = new Asteroid({ scale: 60 });
  assert.equal(asteroid.maxOre, asteroidMaxOre(60));
  assert.equal(asteroid.health, asteroid.maxOre); // health IS ore remaining
  assert.equal(asteroid.alive, true);
  assert.equal(asteroid.respawn, true);
  assert.equal(asteroid.respawnInPlace, true);
  assert.equal(asteroid.weight, 0); // still static geometry
});

test('asteroid replicates its ore-remaining in health network slot [14]', () => {
  const asteroid = new Asteroid({ scale: 60 });
  asteroid.health = 123;
  const state = asteroid.serializeNetworkState();
  assert.equal(state.length, 15);
  assert.equal(state[14], 123);
});

test('bullets deplete asteroid ore through the existing combat path', () => {
  const world = new World();
  const asteroid = world.spawn(new Asteroid({ scale: 60 }));
  const before = asteroid.health;
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: asteroid }] };

  new CombatSubsystem().update(world);

  // Guns are lousy mining tools: rock takes only a FRACTION of the damage a ship
  // would (MINING_DAMAGE_FACTOR), so it depletes slowly.
  assert.equal(asteroid.health, before - 30 * MINING_DAMAGE_FACTOR);
  assert.equal(bullet.destroyed, true); // bullet still dies on the rock
});

test('a fully mined asteroid goes dead and queues a respawn (not destroyed)', () => {
  const world = new World();
  const asteroid = world.spawn(new Asteroid({ scale: 10 }));
  asteroid.health = 20;
  const bullet = world.spawn(new Bullet({ damage: 100 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: asteroid }] };

  new CombatSubsystem().update(world);

  assert.ok(asteroid.health <= 0);
  assert.equal(asteroid.alive, false);
  assert.equal(asteroid.respawnTimer, ASTEROID_RESPAWN_DELAY);
  assert.equal(asteroid.destroyed, false);
});
