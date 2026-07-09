import assert from 'node:assert/strict';
import type { Vector3 } from 'three';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { RespawnSubsystem } from '../../shared/sim/subsystems/respawn.ts';
import { ASTEROID_HULL_RADIUS, SPAWN_RADIUS } from '../../shared/sim/spawn.ts';
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

test('a dead ship revives at a fresh spot with full health once the timer elapses', () => {
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
  // Revives somewhere new in the field, not at the death spot.
  assert.notDeepEqual(ship.transform.position.toArray(), [7, 8, 9]);
  assert.ok(ship.transform.position.length() <= SPAWN_RADIUS + 1e-6);
});

test('a revived ship is repositioned clear of the asteroid it died in', () => {
  const world = new World();
  // A big asteroid sitting on the death spot: respawn must move the ship out.
  world.spawn(new Asteroid({ scale: 120 }));
  const ship = world.spawn(new Ship());
  ship.alive = false;
  ship.health = 0;
  ship.respawnTimer = 0;
  ship.transform.position.set(0, 0, 0);

  new RespawnSubsystem().update(world, 16, 0);

  assert.equal(ship.alive, true);
  assert.ok(ship.transform.position.length() > ASTEROID_HULL_RADIUS * 120);
});

test('respawn teleports the physics body to the new spawn point', () => {
  const world = new World();
  const calls: { position: number[] }[] = [];
  // Stub the physics stepper: only correctBody is exercised here.
  world.physics = {
    drainCollisions: () => [],
    correctBody: (_entity: unknown, position: Vector3) => {
      calls.push({ position: position.toArray() });
    },
  } as unknown as World['physics'];

  const ship = world.spawn(new Ship());
  ship.alive = false;
  ship.health = 0;
  ship.respawnTimer = 0;
  ship.transform.position.set(7, 8, 9);

  new RespawnSubsystem().update(world, 16, 0);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].position, ship.transform.position.toArray());
});
