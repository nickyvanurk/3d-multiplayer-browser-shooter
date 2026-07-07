import assert from 'node:assert/strict';
import { Ship } from '../../shared/sim/entities/ship.js';
import { Asteroid } from '../../shared/sim/entities/asteroid.js';
import { Bullet } from '../../shared/sim/entities/bullet.js';
import { InputCommand } from '../../shared/sim/input.js';
import Types from '../../shared/types.js';
import { test } from './harness.js';

test('Ship has correct type and ported fields', () => {
  const ship = new Ship();
  assert.equal(ship.type, Types.Entities.SPACESHIP);
  assert.equal(ship.acceleration, 3);
  assert.equal(ship.damping, 0.5);
  assert.equal(ship.angularDamping, 0.99);
  assert.equal(ship.health, 100);
  assert.deepEqual(ship.weapons, []);
});

test('Asteroid type and weight rule (scale <= 5 ? 1 : 0)', () => {
  const big = new Asteroid({ scale: 6 });
  assert.equal(big.type, Types.Entities.ASTEROID);
  assert.equal(big.weight, 0);

  const small = new Asteroid({ scale: 5 });
  assert.equal(small.weight, 1);
});

test('Asteroid defaults to scale 1 (weight 1)', () => {
  assert.equal(new Asteroid().weight, 1);
});

test('Bullet type and ported fields', () => {
  const bullet = new Bullet({ damage: 5, speed: 0.5 });
  assert.equal(bullet.type, Types.Entities.BULLET);
  assert.equal(bullet.kinematic, true);
  assert.equal(bullet.damage, 5);
  assert.equal(bullet.velocity.z, 0.5);
  assert.equal(bullet.timeoutMs, 2000);
});

test('Bullet exposes the full rigidbody surface setupRigidBody needs', () => {
  const bullet = new Bullet({ damage: 5 });
  assert.equal(typeof bullet.angularVelocity.x, 'number');
  assert.equal(typeof bullet.angularVelocity.y, 'number');
  assert.equal(typeof bullet.angularVelocity.z, 'number');
  assert.equal(bullet.damping, 0);
  assert.equal(bullet.angularDamping, 0);
  assert.equal(bullet.acceleration, 0);
  assert.equal(typeof bullet.angularAcceleration.x, 'number');
  assert.equal(typeof bullet.angularAcceleration.y, 'number');
  assert.equal(typeof bullet.angularAcceleration.z, 'number');
  assert.equal(bullet.angularAcceleration.isEuler, true);
});

test('Ship.applyInput forward sets velocity.z = acceleration * dt', () => {
  const ship = new Ship();
  const dt = 0.5;
  ship.applyInput(new InputCommand({ forward: true }), dt);
  assert.equal(ship.velocity.z, ship.acceleration * dt);
});

test('Ship.applyInput boost doubles acceleration', () => {
  const ship = new Ship();
  const dt = 0.5;
  ship.applyInput(new InputCommand({ boost: true, forward: true }), dt);
  assert.equal(ship.velocity.z, ship.acceleration * 2 * dt);
});

test('Ship.applyInput clamps tiny angularVelocity.z to 0', () => {
  const ship = new Ship();
  ship.angularVelocity.z = 1e-7;
  ship.applyInput(new InputCommand(), 0.5);
  assert.equal(ship.angularVelocity.z, 0);
});

test('Bullet.update accumulates ageMs and stays alive before timeout', () => {
  const bullet = new Bullet({ timer: 100 });
  bullet.update(60);
  assert.equal(bullet.ageMs, 60);
  assert.equal(bullet.destroyed, false);
});

// timeout-system.js uses `timer -= delta; if (timer < 0)`, i.e. destroyed only
// once accumulated dt STRICTLY exceeds timeoutMs — exactly at the boundary it lives.
test('Bullet at exactly timeoutMs is not destroyed (strict comparison)', () => {
  const bullet = new Bullet({ timer: 100 });
  bullet.update(60);
  bullet.update(40);
  assert.equal(bullet.ageMs, 100);
  assert.equal(bullet.destroyed, false);
});

test('Bullet is destroyed once accumulated dt exceeds timeoutMs', () => {
  const bullet = new Bullet({ timer: 100 });
  bullet.update(60);
  bullet.update(41);
  assert.equal(bullet.ageMs, 101);
  assert.equal(bullet.destroyed, true);
});

test('Ship starts alive with a zero respawn timer', () => {
  const ship = new Ship();
  assert.equal(ship.alive, true);
  assert.equal(ship.respawnTimer, 0);
});

test('a dead ship.update does not apply input or spawn bullets', () => {
  const ship = new Ship();
  ship.alive = false;
  ship.controller = { lastInput: new InputCommand({ forward: true, weaponPrimary: true }) };
  let spawned = 0;
  const fakeWorld = { spawn: (e) => { spawned++; return e; } };

  ship.update(0.5, fakeWorld, 1000);

  assert.deepEqual(ship.velocity.toArray(), [0, 0, 0]);
  assert.equal(spawned, 0);
});

test('Ship.applyInput writes the aim ray and distance', () => {
  const ship = new Ship();
  const input = new InputCommand({
    aim: {
      mouse: { x: 0, y: 0 },
      origin: { x: 1, y: 2, z: 3 },
      direction: { x: 0, y: 0, z: 1 },
      distance: 42,
    },
  });
  ship.applyInput(input, 0.5);
  assert.deepEqual(ship.aim.origin.toArray(), [1, 2, 3]);
  assert.deepEqual(ship.aim.direction.toArray(), [0, 0, 1]);
  assert.equal(ship.aimDistance, 42);
});
