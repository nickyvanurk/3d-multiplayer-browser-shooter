import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';

import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import { NodeMeshProvider } from '../../server/src/physics/node-mesh-provider.ts';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Bullet } from '../../shared/sim/entities/bullet.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { CombatSubsystem } from '../../shared/sim/subsystems/combat.ts';
import { ClientSim, BULLET_LENGTH } from '../../client/src/client-sim.ts';
import { InputCommand } from '../../shared/sim/input.ts';
import { test } from './harness.ts';

async function buildWorld(): Promise<{
  world: World;
  physics: RapierPhysicsWorld;
}> {
  const physics = new RapierPhysicsWorld(new NodeMeshProvider());
  await physics.init();
  physics.reconcileShips = false;
  const world = new World();
  world.physics = physics as never;
  world.onSpawn = (e) => physics.add(e);
  world.onDespawn = (e) => physics.remove(e);
  return { world, physics };
}

test('a bullet is never given a physics body (no collider/rigidbody)', async () => {
  const { world } = await buildWorld();
  const bullet = world.spawn(
    new Bullet({ transform: { position: new Vector3(0, 0, 0) } }),
  );
  assert.ok(!bullet.body, 'bullet must have no physics body');
});

test('a fast bullet aimed at a small asteroid registers a hit (no tunneling)', async () => {
  const { world, physics } = await buildWorld();
  const combat = new CombatSubsystem();

  // Small (scale 1) asteroid at the origin — its half-extent (~1.6) is far less
  // than a bullet's per-step displacement (~8.3), so a solver body tunnels.
  world.spawn(
    new Asteroid({ transform: { position: new Vector3(0, 0, 0) }, scale: 1 }),
  );

  // Bullet 100 units back, flying straight +z through the asteroid.
  const bullet = world.spawn(
    new Bullet({
      transform: {
        position: new Vector3(0, 0, -100),
        rotation: new Quaternion(),
      },
      damage: 5,
    }),
  );

  let hit = false;
  for (let i = 0; i < 40 && !bullet.destroyed; i++) {
    physics.applyAll(world, 16.67);
    physics.step(16.67);
    physics.sweepProjectiles(world, 16.67);
    combat.update(world as never);
    if (bullet.destroyed) hit = true;
    world.reap();
  }

  assert.equal(
    hit,
    true,
    'bullet should have hit the asteroid, not tunneled through',
  );
});

test('a bullet fired from inside its owner passes through it and hits an enemy ship', async () => {
  const { world, physics } = await buildWorld();
  const combat = new CombatSubsystem();

  const owner = new Ship();
  owner.kinematic = true;
  owner.transform.position.set(0, 0, 0);
  world.spawn(owner);

  const enemy = new Ship();
  enemy.kinematic = true;
  enemy.transform.position.set(0, 0, 50);
  world.spawn(enemy);

  // Muzzle sits inside the owner's hull (z spans ~[-6.85, 6.85]), facing +z.
  const bullet = world.spawn(
    new Bullet({
      transform: { position: new Vector3(0, 0, 5), rotation: new Quaternion() },
      damage: 5,
    }),
  );
  bullet.owner = owner;

  for (let i = 0; i < 20 && !bullet.destroyed; i++) {
    physics.applyAll(world, 16.67);
    physics.step(16.67);
    physics.sweepProjectiles(world, 16.67);
    combat.update(world as never);
    world.reap();
  }

  assert.equal(owner.health, 100, 'owner must not be hit by its own bullet');
  assert.equal(enemy.health, 95, 'enemy ship must take the hit');
  assert.equal(
    bullet.destroyed,
    true,
    'bullet is consumed on hitting the enemy',
  );
});

test('a predicted client tracer is removed when its path reaches the enemy', async () => {
  const { world, physics } = await buildWorld();
  const sim = new ClientSim(world, physics);
  world.onSpawn = (e) => sim.onSpawn(e);
  world.onDespawn = (e) => sim.onDespawn(e);

  const ship = new Ship();
  ship.transform.position.set(0, 0, 0);
  world.spawnWithId(1, ship);
  sim.setOwnedShip(ship);

  const enemy = new Ship();
  enemy.kinematic = true;
  enemy.transform.position.set(0, 0, 40); // hull front ~z 33.7
  world.spawnWithId(2, enemy);

  const bullet = new Bullet({
    transform: { position: new Vector3(0, 0, 5), rotation: new Quaternion() },
    damage: 5,
  });
  bullet.owner = ship;
  world.spawnWithId(1_000_000, bullet);
  (sim as unknown as { predictedBullets: Bullet[] }).predictedBullets.push(
    bullet,
  );

  let t = 0;
  for (let i = 0; i < 20 && !bullet.destroyed; i++) {
    t += 16.67;
    sim.update(16.67, t, InputCommand.empty());
  }

  assert.equal(bullet.destroyed, true, 'tracer should be removed on the hit');
  // Removed as its path reaches the hull front (~z 33.7), within one step — never
  // advanced past it. The mesh origin (its tip) means nothing is drawn ahead of
  // this point, so the beam does not poke through the ship.
  const z = bullet.transform.position.z;
  assert.ok(z > 25 && z < 34, `tracer stopped at an unexpected z: ${z}`);
});

test('a predicted tracer emerges from the muzzle, not backward through the ship', async () => {
  const { world, physics } = await buildWorld();
  const sim = new ClientSim(world, physics);
  world.onSpawn = (e) => sim.onSpawn(e);
  world.onDespawn = (e) => sim.onDespawn(e);

  const ship = new Ship(); // at origin; muzzle offset z ~5, hull front z ~6.85
  world.spawnWithId(1, ship);
  sim.setOwnedShip(ship);

  const fire = new InputCommand({
    weaponPrimary: true,
    aim: {
      mouse: { x: 0, y: 0 },
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      distance: 1000,
    },
  });

  let tracer: Bullet | null = null;
  let t = 0;
  const predicted = sim as unknown as { predictedBullets: Bullet[] };
  for (let i = 0; i < 40 && !tracer; i++) {
    t += 16.67;
    const before = predicted.predictedBullets.length;
    sim.update(16.67, t, fire);
    if (predicted.predictedBullets.length > before) {
      tracer =
        predicted.predictedBullets[predicted.predictedBullets.length - 1];
    }
  }

  assert.ok(tracer, 'a tracer should have been fired');
  // The mesh tip is at `position` and the beam trails BULLET_LENGTH behind it.
  // The tail must sit at/ahead of the muzzle — never trailing back through the
  // hull (which would be a strongly negative z, well behind the ship).
  const forward = new Vector3(0, 0, 1).applyQuaternion(
    tracer.transform.rotation,
  );
  const tailZ = tracer.transform.position.z - forward.z * BULLET_LENGTH;
  assert.ok(
    tailZ > 4,
    `beam tail trails behind the ship: tailZ=${tailZ} (muzzle ~5)`,
  );
});
