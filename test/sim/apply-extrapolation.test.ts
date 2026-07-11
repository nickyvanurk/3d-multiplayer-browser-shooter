import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import Types from '../../shared/types.ts';
import {
  resolveWorldVelocity,
  extrapolatePosition,
} from '../../shared/sim/net/extrapolate.ts';
import { test } from './harness.ts';

test('ship velocity is world-space and advances position over age', () => {
  const worldVel = resolveWorldVelocity(
    new Vector3(),
    Types.Entities.SPACESHIP,
    new Vector3(10, 0, 0),
    new Quaternion(),
  );
  assert.deepEqual([worldVel.x, worldVel.y, worldVel.z], [10, 0, 0]);

  const pos = extrapolatePosition(
    new Vector3(),
    new Vector3(0, 0, 0),
    worldVel,
    200,
  );
  assert.ok(Math.abs(pos.x - 2) < 1e-9);
});

test('bullet velocity is local +z rotated into world space', () => {
  // Rotate 90deg about +y so local +z maps to world +x.
  const rot = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 2,
  );
  const worldVel = resolveWorldVelocity(
    new Vector3(),
    Types.Entities.BULLET,
    new Vector3(0, 0, 100),
    rot,
  );
  // Teeth: an unrotated copy would leave z=100/x=0 and fail both asserts below.
  assert.ok(Math.abs(worldVel.x - 100) < 1e-6);
  assert.ok(Math.abs(worldVel.z) < 1e-6);

  const pos = extrapolatePosition(
    new Vector3(),
    new Vector3(0, 0, 0),
    worldVel,
    100, // 0.1s -> 10 units along world +x
  );
  assert.ok(Math.abs(pos.x - 10) < 1e-6);
  assert.ok(Math.abs(pos.z) < 1e-6);
});

test('age 0 yields the raw pose', () => {
  const pos = extrapolatePosition(
    new Vector3(),
    new Vector3(3, 4, 5),
    new Vector3(99, 99, 99),
    0,
  );
  assert.deepEqual([pos.x, pos.y, pos.z], [3, 4, 5]);
});
