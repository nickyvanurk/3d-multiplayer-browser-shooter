import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { RespawnSubsystem } from '../../shared/sim/subsystems/respawn.ts';
import { test } from './harness.ts';

function depleted(scale: number): Asteroid {
  const a = new Asteroid({ scale });
  a.transform.position.set(0, 0, 0);
  a.alive = false;
  a.health = 0;
  a.respawnTimer = 0;
  return a;
}

test('a depleted asteroid refills to full ore IN PLACE once the timer elapses', () => {
  const world = new World();
  const a = world.spawn(depleted(60));

  new RespawnSubsystem().update(world, 16, 0);

  assert.equal(a.alive, true);
  assert.equal(a.health, a.maxOre); // full ore, not ship's 100
  assert.deepEqual(a.transform.position.toArray(), [0, 0, 0]); // never moved
});

test('a depleted asteroid waits while a ship loiters in its slot', () => {
  const world = new World();
  const a = world.spawn(depleted(60));
  const ship = world.spawn(new Ship());
  ship.transform.position.set(0, 0, 0); // sitting right on the asteroid

  const sub = new RespawnSubsystem();
  sub.update(world, 16, 0);
  assert.equal(a.alive, false); // blocked — would spawn inside the ship

  // Ship flies far away; next tick the slot is clear and it respawns.
  ship.transform.position.set(5000, 0, 0);
  sub.update(world, 16, 0);
  assert.equal(a.alive, true);
  assert.equal(a.health, a.maxOre);
});

test('ship respawn behaviour is unchanged (still teleports + heals to 100)', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.alive = false;
  ship.health = 0;
  ship.respawnTimer = 0;
  ship.transform.position.set(7, 8, 9);

  new RespawnSubsystem().update(world, 16, 0);

  assert.equal(ship.alive, true);
  assert.equal(ship.health, 100);
  assert.notDeepEqual(ship.transform.position.toArray(), [7, 8, 9]);
});
