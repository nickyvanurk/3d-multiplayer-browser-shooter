import assert from 'node:assert/strict';
import { Vector3, Quaternion, Euler } from 'three';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Weapon, getWeaponTransform } from '../../shared/sim/weapon.ts';
import type { WeaponParent } from '../../shared/sim/weapon.ts';
import { test } from './harness.ts';

// Collect the tick times at which a weapon fires while `firingPrimary` is held
// for the whole span, stepping `time` by `step`.
function fireTimes(weapon: Weapon, end: number, step: number): number[] {
  const fires: number[] = [];
  for (let time = 0; time <= end; time += step) {
    weapon.tryFire(time, (_pos, _rot, _damage) => fires.push(time));
  }
  return fires;
}

test('fires on the same tick the trigger is pressed (no wind-up)', () => {
  const ship = new Ship();
  ship.firingPrimary = true;
  const weapon = new Weapon({ delay: 0, fireInterval: 250, parent: ship });

  const fires: number[] = [];
  weapon.tryFire(1000, () => fires.push(1000));

  assert.deepEqual(fires, [1000]);
});

test('cadence with delay=0, fireInterval=250 (step 50): shot every interval from t=0', () => {
  const ship = new Ship();
  ship.firingPrimary = true;
  const weapon = new Weapon({ delay: 0, fireInterval: 250, parent: ship });

  assert.deepEqual(fireTimes(weapon, 1000, 50), [0, 250, 500, 750, 1000]);
});

test('delay staggers the first shot without adding a fireInterval warm-up', () => {
  const ship = new Ship();
  ship.firingPrimary = true;
  const weapon = new Weapon({ delay: 125, fireInterval: 250, parent: ship });

  // First shot lands at the first tick past the 125ms stagger (t=150), NOT
  // delay+fireInterval later.
  assert.deepEqual(fireTimes(weapon, 1000, 50), [150, 400, 650, 900]);
});

test('dual staggered weapons keep their offset and never fire on the same tick', () => {
  const ship = new Ship();
  ship.firingPrimary = true;
  const right = new Weapon({ delay: 0, fireInterval: 250, parent: ship });
  const left = new Weapon({ delay: 125, fireInterval: 250, parent: ship });

  const rightFires: number[] = [];
  const leftFires: number[] = [];
  for (let time = 0; time <= 5000; time += 50) {
    right.tryFire(time, () => rightFires.push(time));
    left.tryFire(time, () => leftFires.push(time));
  }

  // Matched cadence (counts differ by at most the one head-start shot) and no
  // tick ever has them firing together — the stagger never collapses.
  assert.ok(Math.abs(rightFires.length - leftFires.length) <= 1);
  const overlap = rightFires.filter((t) => leftFires.includes(t));
  assert.deepEqual(overlap, []);
});

test('never firing primary → no shots', () => {
  const ship = new Ship(); // firingPrimary defaults false
  const weapon = new Weapon({ delay: 0, fireInterval: 100, parent: ship });

  assert.deepEqual(fireTimes(weapon, 1000, 50), []);
});

test('releasing the trigger stops fire; re-pressing fires immediately again', () => {
  const ship = new Ship();
  const weapon = new Weapon({ delay: 0, fireInterval: 250, parent: ship });

  ship.firingPrimary = true;
  const fires: number[] = [];
  weapon.tryFire(0, () => fires.push(0)); // instant shot on press
  assert.deepEqual(fires, [0]);

  ship.firingPrimary = false;
  for (let time = 50; time <= 400; time += 50) {
    weapon.tryFire(time, () => fires.push(time));
  }
  assert.deepEqual(fires, [0]); // no shots while released

  // Fresh press well within the old fireInterval still fires instantly.
  ship.firingPrimary = true;
  weapon.tryFire(450, () => fires.push(450));
  assert.deepEqual(fires, [0, 450]);
});

test('getWeaponTransform with no aim: rotation === ship rotation, position = offset·rot + pos', () => {
  const ship = new Ship();
  (ship as WeaponParent).aim = null;
  ship.transform.position.set(10, 20, 30);
  ship.transform.rotation.copy(
    new Quaternion().setFromEuler(new Euler(0.3, 0.6, -0.2)),
  );

  const offset = new Vector3(1.3, 0.9, 5);
  const weapon = new Weapon({ offset, parent: ship });

  const { position, rotation } = getWeaponTransform(weapon);

  assert.equal(rotation, ship.transform.rotation);

  const expected = offset
    .clone()
    .applyQuaternion(ship.transform.rotation)
    .add(ship.transform.position);
  assert.ok(Math.abs(position.x - expected.x) < 1e-9);
  assert.ok(Math.abs(position.y - expected.y) < 1e-9);
  assert.ok(Math.abs(position.z - expected.z) < 1e-9);
});
