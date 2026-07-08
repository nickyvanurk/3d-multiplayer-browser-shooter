import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Bullet } from '../../shared/sim/entities/bullet.ts';
import { RESPAWN_DELAY } from '../../shared/sim/entities/ship.ts';
import { CombatSubsystem } from '../../shared/sim/subsystems/combat.ts';
import { test } from './harness.ts';

test('bullet→ship collision damages the ship and destroys the bullet', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: ship }] };
  const combat = new CombatSubsystem();

  combat.update(world);

  assert.equal(ship.health, 70);
  assert.equal(bullet.destroyed, true);
});

test('a ship reduced to health <= 0 goes dead + queues respawn, not destroyed', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 100 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: ship }] };

  new CombatSubsystem().update(world);

  assert.equal(ship.health, 0);
  assert.equal(ship.alive, false);
  assert.equal(ship.respawnTimer, RESPAWN_DELAY);
  assert.equal(ship.destroyed, false);
});

test('an already-dead ship is not re-killed by the combat sweep', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.alive = false;
  ship.health = 0;
  ship.respawnTimer = 1234;
  world.physics = { drainCollisions: () => [] };

  new CombatSubsystem().update(world);

  assert.equal(ship.respawnTimer, 1234);
  assert.equal(ship.destroyed, false);
});

test('a ship that survives non-lethal damage is not destroyed', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: ship }] };

  new CombatSubsystem().update(world);

  assert.equal(ship.health, 70);
  assert.equal(ship.destroyed, false);
});

test('collision resolution is order-independent ({a:ship,b:bullet})', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  world.physics = { drainCollisions: () => [{ a: ship, b: bullet }] };

  new CombatSubsystem().update(world);

  assert.equal(ship.health, 70);
  assert.equal(bullet.destroyed, true);
  assert.equal(ship.destroyed, false);
});

test('a victim only suffers damage once per tick (not stackable)', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const b1 = world.spawn(new Bullet({ damage: 30 }));
  const b2 = world.spawn(new Bullet({ damage: 30 }));
  world.physics = {
    drainCollisions: () => [
      { a: b1, b: ship },
      { a: b2, b: ship },
    ],
  };

  new CombatSubsystem().update(world);

  assert.equal(ship.health, 70);
  assert.equal(b1.destroyed, true);
  assert.equal(b2.destroyed, true);
});
