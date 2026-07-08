import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { RespawnSubsystem } from '../../shared/sim/subsystems/respawn.ts';
import { test } from './harness.ts';

test('living ships are left untouched', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.transform.position.set(1, 2, 3);

  new RespawnSubsystem().update(world, 16, 0);

  assert.equal(ship.alive, true);
  assert.deepEqual(ship.transform.position.toArray(), [1, 2, 3]);
});

test('a dead ship counts its respawn timer down', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.alive = false;
  ship.respawnTimer = 3000;

  new RespawnSubsystem().update(world, 1000, 0);

  assert.equal(ship.respawnTimer, 2000);
  assert.equal(ship.alive, false);
});

test('a dead ship revives at its death spot with full health once the timer elapses', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.alive = false;
  ship.health = 0;
  ship.respawnTimer = 3000;
  ship.transform.position.set(7, 8, 9);
  ship.velocity.set(1, 2, 3);
  ship.angularVelocity.set(4, 5, 6);

  const subsystem = new RespawnSubsystem();
  subsystem.update(world, 2000, 0);
  assert.equal(ship.alive, false);

  subsystem.update(world, 1000, 0);

  assert.equal(ship.alive, true);
  assert.equal(ship.health, 100);
  assert.deepEqual(ship.velocity.toArray(), [0, 0, 0]);
  assert.deepEqual(ship.angularVelocity.toArray(), [0, 0, 0]);
  assert.deepEqual(ship.transform.position.toArray(), [7, 8, 9]);
});
