import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { World } from '../../shared/sim/world.ts';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Bullet } from '../../shared/sim/entities/bullet.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import {
  RESPAWN_DELAY,
  maxWeaponDamage,
} from '../../shared/sim/entities/ship.ts';
import {
  MINING_DAMAGE_FACTOR,
  MINING_LASER_FACTOR,
  Items,
} from '../../shared/sim/mining.ts';
import {
  CombatSubsystem,
  applyDamage,
} from '../../shared/sim/subsystems/combat.ts';
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

test('a bullet does not damage or destroy against its own ship (owner)', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  bullet.owner = ship;
  world.physics = { drainCollisions: () => [{ a: bullet, b: ship }] };

  new CombatSubsystem().update(world);

  assert.equal(ship.health, 100);
  assert.equal(bullet.destroyed, false);
});

test('owner exclusion is order-independent ({a:ship,b:bullet})', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  bullet.owner = ship;
  world.physics = { drainCollisions: () => [{ a: ship, b: bullet }] };

  new CombatSubsystem().update(world);

  assert.equal(ship.health, 100);
  assert.equal(bullet.destroyed, false);
});

test('a bullet still damages and is destroyed by a ship that is not its owner', () => {
  const world = new World();
  const owner = world.spawn(new Ship());
  const target = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  bullet.owner = owner;
  world.physics = { drainCollisions: () => [{ a: bullet, b: target }] };

  new CombatSubsystem().update(world);

  assert.equal(target.health, 70);
  assert.equal(owner.health, 100);
  assert.equal(bullet.destroyed, true);
});

test('a default bullet mines rock at the reduced global factor', () => {
  const world = new World();
  const rock = world.spawn(new Asteroid({ scale: 60 }));
  const full = rock.health;
  const bullet = world.spawn(new Bullet({ damage: 10 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: rock }] };

  new CombatSubsystem().update(world);

  assert.equal(full - rock.health, 10 * MINING_DAMAGE_FACTOR);
});

test('a mining-laser bullet mines rock at its own higher factor', () => {
  const world = new World();
  const rock = world.spawn(new Asteroid({ scale: 60 }));
  const full = rock.health;
  const bullet = world.spawn(
    new Bullet({ damage: 10, miningFactor: MINING_LASER_FACTOR }),
  );
  world.physics = { drainCollisions: () => [{ a: bullet, b: rock }] };

  new CombatSubsystem().update(world);

  const mined = full - rock.health;
  assert.equal(mined, 10 * MINING_LASER_FACTOR);
  // And it genuinely out-mines the default combat weapon.
  assert.ok(mined > 10 * MINING_DAMAGE_FACTOR);
});

test('a bullet mining factor does NOT amplify ship (non-rock) damage', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  const bullet = world.spawn(
    new Bullet({ damage: 30, miningFactor: MINING_LASER_FACTOR }),
  );
  world.physics = { drainCollisions: () => [{ a: bullet, b: ship }] };

  new CombatSubsystem().update(world);

  // miningFactor only applies to rock (maxOre); a ship takes the raw damage.
  assert.equal(ship.health, 70);
});

test('a hit stamps the victim with its attacker (the firing ship)', () => {
  const world = new World();
  const shooter = world.spawn(new Ship());
  const target = world.spawn(new Ship());
  const bullet = world.spawn(new Bullet({ damage: 30 }));
  bullet.owner = shooter;
  world.physics = { drainCollisions: () => [{ a: bullet, b: target }] };

  new CombatSubsystem().update(world);

  assert.equal(target.lastHitBy, shooter);
});

test('a lethal hit reports a kill crediting the shooter with the victim level', () => {
  const world = new World();
  const shooter = world.spawn(new Ship());
  const target = world.spawn(new Ship());
  target.level = 4;
  const bullet = world.spawn(new Bullet({ damage: 100 }));
  bullet.owner = shooter;
  world.physics = { drainCollisions: () => [{ a: bullet, b: target }] };

  const combat = new CombatSubsystem();
  combat.update(world);

  const kills = combat.drainKills();
  assert.equal(kills.length, 1);
  assert.equal(kills[0].killerId, shooter.id);
  assert.equal(kills[0].victimId, target.id);
  assert.equal(kills[0].victimLevel, 4);
  // Drained once, cleared after.
  assert.equal(combat.drainKills().length, 0);
});

test('a destroyed asteroid does not report a kill', () => {
  const world = new World();
  const rock = world.spawn(new Asteroid({ scale: 10 }));
  const bullet = world.spawn(new Bullet({ damage: 100000 }));
  world.physics = { drainCollisions: () => [{ a: bullet, b: rock }] };

  const combat = new CombatSubsystem();
  combat.update(world);

  assert.equal(combat.drainKills().length, 0);
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

// applyDamage is the shared damage primitive used by both the collision path
// (bot bullets) and the server's client-reported Hit path (players).

test('applyDamage deals raw damage to a ship and credits the attacker', () => {
  const world = new World();
  const attacker = world.spawn(new Ship());
  const target = world.spawn(new Ship());

  applyDamage(target, 30, undefined, undefined, attacker);

  assert.equal(target.health, 70);
  assert.equal(target.lastHitBy, attacker);
});

test('applyDamage mines rock at the default factor (attacker not credited)', () => {
  const world = new World();
  const attacker = world.spawn(new Ship());
  const rock = world.spawn(new Asteroid({ scale: 60 }));
  const full = rock.health;

  // Passing an attacker must not throw or credit rock (it carries no lastHitBy) —
  // a mined-out asteroid is never a kill.
  applyDamage(rock, 10, undefined, undefined, attacker);

  assert.equal(full - rock.health, 10 * MINING_DAMAGE_FACTOR);
});

test('applyDamage honours an explicit (laser) mining factor on rock', () => {
  const world = new World();
  const rock = world.spawn(new Asteroid({ scale: 60 }));
  const full = rock.health;

  applyDamage(rock, 10, MINING_LASER_FACTOR);

  assert.equal(full - rock.health, 10 * MINING_LASER_FACTOR);
});

test('applyDamage stamps the impact point on rock', () => {
  const world = new World();
  const rock = world.spawn(new Asteroid({ scale: 60 }));

  applyDamage(rock, 10, undefined, new Vector3(1, 2, 3));

  assert.deepEqual(
    [rock.lastImpact.x, rock.lastImpact.y, rock.lastImpact.z],
    [1, 2, 3],
  );
});

test('applyDamage leaves an invulnerable victim untouched', () => {
  const world = new World();
  const ship = world.spawn(new Ship());
  ship.invulnerable = true;

  applyDamage(ship, 30, undefined);

  assert.equal(ship.health, 100);
});

test('maxWeaponDamage clamps to the ship real equipped weapons', () => {
  const ship = new Ship();
  // Default loadout: cannons in primary (damage 5), secondary empty.
  assert.equal(maxWeaponDamage(ship), 5);

  // Only the mining laser equipped → its low combat damage caps the clamp.
  ship.primaryItem = -1;
  ship.secondaryItem = Items.MINING_LASER;
  assert.equal(maxWeaponDamage(ship), 1);
});
