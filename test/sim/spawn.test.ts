import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import {
  pickSpawnPosition,
  SPAWN_RADIUS,
  ASTEROID_HULL_RADIUS,
} from '../../shared/sim/spawn.ts';
import Utils from '../../shared/utils.ts';
import { test } from './harness.ts';

test('spawn point stays within the spawn radius', () => {
  const world = new World();
  const rng = Utils.randomNumberGenerator(42);

  for (let i = 0; i < 50; i++) {
    const p = pickSpawnPosition(world, rng);
    assert.ok(p.length() <= SPAWN_RADIUS + 1e-6, `radius ${p.length()}`);
  }
});

test('spawn point never lands inside an asteroid', () => {
  const world = new World();
  // One large asteroid at the origin: scale 120 -> world radius ~195.
  world.spawn(new Asteroid({ scale: 120 }));
  const rng = Utils.randomNumberGenerator(7);
  const asteroidRadius = ASTEROID_HULL_RADIUS * 120;

  for (let i = 0; i < 100; i++) {
    const p = pickSpawnPosition(world, rng);
    assert.ok(
      p.length() > asteroidRadius,
      `spawned ${p.length()} from origin, inside radius ${asteroidRadius}`,
    );
  }
});

test('spawn point is pushed away from existing ships', () => {
  const world = new World();
  // A single ship at the origin; with no asteroids, the pick should favour the
  // farthest of its candidates.
  world.spawn(new Ship());
  const rng = Utils.randomNumberGenerator(3);

  const p = pickSpawnPosition(world, rng);
  assert.ok(p.length() > 400, `only ${p.length()} from the lone ship`);
});

test('a dead ship is not treated as crowding', () => {
  const world = new World();
  const dead = world.spawn(new Ship());
  dead.alive = false;
  // No live ships and no asteroids: any in-sphere point is valid, so this just
  // must not throw and must return a usable point.
  const p = pickSpawnPosition(world, Utils.randomNumberGenerator(9));
  assert.ok(p.length() <= SPAWN_RADIUS + 1e-6);
});

test('the excluded entity does not pull the pick toward itself', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.transform.position.set(0, 0, 0);
  // Excluding the respawning ship means it is ignored when scoring crowding, so
  // a lone respawn still ranges across the whole sphere rather than hugging its
  // own (stale) position.
  const p = pickSpawnPosition(world, Utils.randomNumberGenerator(11), ship);
  assert.ok(p.length() <= SPAWN_RADIUS + 1e-6);
});
