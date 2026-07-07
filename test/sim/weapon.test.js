import assert from 'node:assert/strict';
import { Vector3, Quaternion, Euler } from 'three';
import { Ship } from '../../shared/sim/entities/ship.js';
import { Weapon, getWeaponTransform } from '../../shared/sim/weapon.js';
import { test } from './harness.js';

// Cadence derived by tracing the ported weapon-system.js state machine with a
// 50ms step: activation sets lastFired=0; firing engages at the first tick where
// lastFired+delay < time (t=150); shots fire at the first tick where
// lastFired+fireInterval < time (t=450), then every fireInterval quantised up to
// the 50ms step (750, 1050).
test('firing cadence with delay=125, fireInterval=250 (step 50)', () => {
  const ship = new Ship();
  ship.firingPrimary = true;
  const weapon = new Weapon({
    offset: new Vector3(1.3, 0.9, 5),
    delay: 125,
    fireInterval: 250,
    parent: ship
  });

  const fires = [];
  for (let time = 0; time <= 1100; time += 50) {
    weapon.tryFire(time, (_pos, _rot, damage) => fires.push({ time, damage }));
  }

  assert.deepEqual(fires.map((f) => f.time), [450, 750, 1050]);
  assert.deepEqual(fires.map((f) => f.damage), [5, 5, 5]);
});

test('never firing primary → no shots, firing stays false', () => {
  const ship = new Ship(); // firingPrimary defaults false
  const weapon = new Weapon({
    offset: new Vector3(),
    delay: 0,
    fireInterval: 100,
    parent: ship
  });

  const fires = [];
  for (let time = 0; time <= 1000; time += 50) {
    weapon.tryFire(time, () => fires.push(time));
  }

  assert.equal(fires.length, 0);
  assert.equal(weapon.firing, false);
});

test('releasing primary resets firing to false and stops shots', () => {
  const ship = new Ship();
  const weapon = new Weapon({
    offset: new Vector3(),
    delay: 125,
    fireInterval: 250,
    parent: ship
  });

  ship.firingPrimary = true;
  const fires = [];
  for (let time = 0; time <= 500; time += 50) {
    weapon.tryFire(time, () => fires.push(time));
  }
  assert.equal(weapon.firing, true);
  assert.equal(fires.length, 1); // shot at 450

  ship.firingPrimary = false;
  for (let time = 550; time <= 1100; time += 50) {
    weapon.tryFire(time, () => fires.push(time));
  }
  assert.equal(weapon.firing, false);
  assert.equal(fires.length, 1); // no further shots
});

test('getWeaponTransform with no aim: rotation === ship rotation, position = offset·rot + pos', () => {
  const ship = new Ship();
  ship.aim = null;
  ship.transform.position.set(10, 20, 30);
  ship.transform.rotation.copy(new Quaternion().setFromEuler(new Euler(0.3, 0.6, -0.2)));

  const offset = new Vector3(1.3, 0.9, 5);
  const weapon = new Weapon({ offset, parent: ship });

  const { position, rotation } = getWeaponTransform(weapon);

  assert.equal(rotation, ship.transform.rotation);

  const expected = offset.clone()
    .applyQuaternion(ship.transform.rotation)
    .add(ship.transform.position);
  assert.ok(Math.abs(position.x - expected.x) < 1e-9);
  assert.ok(Math.abs(position.y - expected.y) < 1e-9);
  assert.ok(Math.abs(position.z - expected.z) < 1e-9);
});
