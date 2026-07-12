import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { MiningSubsystem } from '../../shared/sim/subsystems/mining.ts';
import {
  ORE_PER_CHUNK,
  ORE_STEP,
  CHUNK_TTL_MS,
  CHUNK_ARM_MS,
  CHUNK_SPREAD,
  CHUNK_OUT_MARGIN,
  chunksForRange,
} from '../../shared/sim/mining.ts';
import { XP_PER_ORE, xpForNextLevel } from '../../shared/sim/progression.ts';
import { test } from './harness.ts';

// Stamp the impact point (as combat would), drop the asteroid's ore, and run one
// mining tick to break the chunks off there.
function mineOnce(
  world: World,
  mining: MiningSubsystem,
  a: Asteroid,
  amount: number,
  impact = new Vector3(0, 0, 0),
) {
  a.lastImpact.copy(impact);
  a.health -= amount;
  mining.update(world, 16);
}

test('mining an asteroid spawns one pickup per crossed ore threshold', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const mining = new MiningSubsystem();
  mining.update(world, 16); // establish baseline at full ore

  const before = a.health;
  mineOnce(world, mining, a, ORE_STEP * 3);

  assert.equal(
    mining.pickups.length,
    chunksForRange(a.maxOre, before, before - ORE_STEP * 3),
  );
  assert.equal(mining.pickups.length, 3);
});

test('chunks spawn just outside the impact, never inside the rock', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const center = a.transform.position.set(500, 0, 0).clone();
  const mining = new MiningSubsystem();
  mining.update(world, 16);

  const impact = new Vector3(480, 12, 3); // where the bullet struck the surface
  const surfaceDist = impact.distanceTo(center);
  mineOnce(world, mining, a, ORE_STEP * 2, impact);

  assert.ok(mining.pickups.length > 0);
  for (const pickup of mining.pickups) {
    // Outside the surface (farther from centre than the impact)...
    assert.ok(pickup.position.distanceTo(center) >= surfaceDist);
    // ...but still a cluster near the impact, not flung across the map.
    assert.ok(
      pickup.position.distanceTo(impact) <= CHUNK_OUT_MARGIN + 2 * CHUNK_SPREAD,
    );
  }
});

test('drainSpawned reports each new chunk with its id and position', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP * 3, new Vector3(1, 2, 3));

  const spawned = mining.drainSpawned();
  assert.equal(spawned.length, mining.pickups.length);
  assert.deepEqual(
    spawned.map((s) => s.id).sort(),
    mining.pickups.map((p) => p.id).sort(),
  );
  // Draining clears the queue.
  assert.equal(mining.drainSpawned().length, 0);
});

test('a chunk is armed: not collected until CHUNK_ARM_MS has elapsed', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const ship = world.spawn(new Ship());
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP); // one threshold → exactly one chunk

  assert.equal(mining.pickups.length, 1);
  const pickup = mining.pickups[0];
  ship.transform.position.copy(pickup.position); // sitting right on it

  mining.update(world, 16); // still arming
  assert.equal(ship.cargo, 0, 'armed chunk is not vacuumed on contact');
  assert.ok(mining.pickups.includes(pickup));

  mining.update(world, CHUNK_ARM_MS); // arm elapses → collectable
  assert.equal(ship.cargo, ORE_PER_CHUNK);
  assert.ok(!mining.pickups.includes(pickup));
  const collected = mining.drainCollected();
  assert.equal(collected.length, 1);
  assert.equal(collected[0].id, pickup.id);
});

test('collecting a chunk awards XP for the ore', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const ship = world.spawn(new Ship());
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP); // one chunk
  ship.transform.position.copy(mining.pickups[0].position);

  mining.update(world, CHUNK_ARM_MS); // arm elapses → collected

  assert.equal(ship.cargo, ORE_PER_CHUNK);
  assert.equal(ship.xp, XP_PER_ORE);
});

test('ore XP can level the collector up', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const ship = world.spawn(new Ship());
  // One ore short of level 2, so the next chunk tips it over.
  ship.xp = xpForNextLevel(1) - XP_PER_ORE;
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP);
  ship.transform.position.copy(mining.pickups[0].position);

  mining.update(world, CHUNK_ARM_MS);

  assert.equal(ship.level, 2);
  assert.equal(ship.xp, 0);
});

test('a dead ship earns no ore XP (cannot collect)', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const ship = world.spawn(new Ship());
  ship.alive = false;
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP);
  ship.transform.position.copy(mining.pickups[0].position);

  mining.update(world, CHUNK_ARM_MS);

  assert.equal(ship.xp, 0);
});

test('a full hold does not collect (chunk stays for later)', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const ship = world.spawn(new Ship());
  ship.cargo = ship.cargoCapacity; // FULL
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP * 2);

  const count = mining.pickups.length;
  ship.transform.position.copy(mining.pickups[0].position);
  mining.update(world, CHUNK_ARM_MS); // armed, but hold is full

  assert.equal(ship.cargo, ship.cargoCapacity); // unchanged
  assert.equal(mining.pickups.length, count); // nothing consumed
});

test('an uncollected chunk despawns after its TTL', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP * 2);
  assert.ok(mining.pickups.length > 0);

  mining.update(world, CHUNK_TTL_MS + 1); // let it age out (no ship near)

  assert.equal(mining.pickups.length, 0);
  assert.equal(mining.drainCollected().length, 0); // TTL expiry is not a collect
});

test('a respawned (refilled) asteroid does not spawn phantom chunks', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP * 2);
  mining.pickups.length = 0; // clear for clarity

  // Asteroid refills on respawn: ore jumps back up.
  a.health = a.maxOre;
  mining.update(world, 16);

  assert.equal(mining.pickups.length, 0);
});

test('a dead ship cannot vacuum up chunks', () => {
  const world = new World();
  const a = world.spawn(new Asteroid({ scale: 60 }));
  const ship = world.spawn(new Ship());
  ship.alive = false;
  const mining = new MiningSubsystem();
  mining.update(world, 16);
  mineOnce(world, mining, a, ORE_STEP * 2);

  ship.transform.position.copy(mining.pickups[0].position);
  mining.update(world, CHUNK_ARM_MS);

  assert.equal(ship.cargo, 0);
});
