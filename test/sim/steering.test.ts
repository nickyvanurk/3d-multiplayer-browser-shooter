import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { test } from './harness.ts';
import {
  FORWARD,
  gaussianConeError,
  leadIntercept,
  slewQuaternionToward,
  truncate,
} from '../../server/src/ai/steering.ts';
import Utils from '../../shared/utils.ts';

// A crossing target the shooter can hit: bullet is far faster than the target,
// and the target moves sideways, so the intercept point must sit AHEAD of the
// target's current position along its travel direction.
test('leadIntercept aims ahead of a crossing target', () => {
  const shooterPos = new Vector3(0, 0, 0);
  const shooterVel = new Vector3(0, 0, 0);
  const targetPos = new Vector3(0, 0, 100);
  const targetVel = new Vector3(30, 0, 0); // units/sec, moving +x
  const bulletSpeed = 1500; // units/sec

  const aim = leadIntercept(
    shooterPos,
    shooterVel,
    targetPos,
    targetVel,
    bulletSpeed,
  );
  assert.ok(aim, 'expected an intercept solution');
  // Lead must be in the target's direction of travel (+x), and modest since the
  // bullet is much faster than the target.
  assert.ok(aim!.x > 0, `expected positive lead in x, got ${aim!.x}`);
  assert.ok(aim!.x < targetVel.x, `lead should be small, got ${aim!.x}`);
  // Distance ~100 / 1500 s of flight, target moves ~2 units.
  assert.ok(
    Math.abs(aim!.x - 2) < 0.5,
    `expected ~2 units lead, got ${aim!.x}`,
  );
});

test('leadIntercept returns null when the target outruns the bullet', () => {
  const aim = leadIntercept(
    new Vector3(0, 0, 0),
    new Vector3(0, 0, 0),
    new Vector3(0, 0, 100),
    new Vector3(0, 0, 50), // fleeing straight away, faster than the bullet
    10, // slow bullet
  );
  assert.equal(aim, null);
});

test('leadIntercept with a stationary target aims at it', () => {
  const target = new Vector3(5, -3, 80);
  const aim = leadIntercept(
    new Vector3(0, 0, 0),
    new Vector3(0, 0, 0),
    target,
    new Vector3(0, 0, 0),
    1500,
  );
  assert.ok(aim);
  assert.ok(
    aim!.distanceTo(target) < 1e-6,
    `expected aim at target, got ${aim!.toArray()}`,
  );
});

test('slewQuaternionToward never rotates more than the cap in one tick', () => {
  const current = new Quaternion(); // facing +Z
  // Target 90 degrees to the side.
  const targetDir = new Vector3(1, 0, 0);
  const cap = (10 * Math.PI) / 180; // 10 degrees
  const next = slewQuaternionToward(current, targetDir, cap);

  const before = FORWARD.clone().applyQuaternion(current);
  const after = FORWARD.clone().applyQuaternion(next);
  const rotated = before.angleTo(after);
  assert.ok(
    rotated <= cap + 1e-6,
    `rotated ${(rotated * 180) / Math.PI}deg, cap ${(cap * 180) / Math.PI}deg`,
  );
  // And it should rotate toward the target (roughly the full cap since target is far).
  assert.ok(rotated > cap - 1e-3, `expected near-cap rotation, got ${rotated}`);
});

test('slewQuaternionToward snaps exactly onto a within-cap target', () => {
  const current = new Quaternion();
  const targetDir = new Vector3(0, 0, 1); // already facing it
  const next = slewQuaternionToward(current, targetDir, (10 * Math.PI) / 180);
  const after = FORWARD.clone().applyQuaternion(next);
  assert.ok(after.angleTo(targetDir) < 1e-6);
});

test('gaussianConeError stays bounded and averages near zero offset', () => {
  const rng = Utils.randomNumberGenerator(42);
  const dir = new Vector3(0, 0, 1);
  const sigma = (8 * Math.PI) / 180;
  let sumX = 0;
  let sumY = 0;
  let maxAngle = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const out = gaussianConeError(dir, sigma, rng);
    assert.ok(
      Math.abs(out.length() - 1) < 1e-6,
      'result must stay unit length',
    );
    const angle = out.angleTo(dir);
    maxAngle = Math.max(maxAngle, angle);
    sumX += out.x;
    sumY += out.y;
  }
  // Mean deflection ~0 (symmetric azimuth).
  assert.ok(Math.abs(sumX / N) < 0.02, `mean x offset ${sumX / N}`);
  assert.ok(Math.abs(sumY / N) < 0.02, `mean y offset ${sumY / N}`);
  // No wild outliers beyond ~5 sigma.
  assert.ok(maxAngle < sigma * 6, `max angle ${(maxAngle * 180) / Math.PI}deg`);
});

test('truncate caps magnitude but preserves direction', () => {
  const v = new Vector3(3, 4, 0); // length 5
  const t = truncate(v.clone(), 2.5);
  assert.ok(Math.abs(t.length() - 2.5) < 1e-6);
  assert.ok(t.clone().normalize().distanceTo(v.clone().normalize()) < 1e-6);
  // Under the cap: unchanged.
  const u = truncate(new Vector3(1, 0, 0), 5);
  assert.ok(u.distanceTo(new Vector3(1, 0, 0)) < 1e-6);
});
