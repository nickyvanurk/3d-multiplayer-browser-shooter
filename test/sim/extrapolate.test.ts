import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import {
  snapshotAge,
  extrapolatePosition,
  extrapolateRotation,
  MAX_EXTRAP_MS,
} from '../../shared/sim/net/extrapolate.ts';
import { test } from './harness.ts';

test('snapshotAge is serverNow - serverTime when synced', () => {
  assert.equal(snapshotAge(1100, 1000, true), 100);
});

test('snapshotAge is 0 before the clock is synced', () => {
  assert.equal(snapshotAge(9999, 1000, false), 0);
});

test('snapshotAge never goes negative', () => {
  assert.equal(snapshotAge(900, 1000, true), 0);
});

test('snapshotAge clamps to the extrapolation ceiling', () => {
  assert.equal(
    snapshotAge(1000 + MAX_EXTRAP_MS + 500, 1000, true),
    MAX_EXTRAP_MS,
  );
});

test('extrapolatePosition advances by worldVel * ageSeconds', () => {
  const out = new Vector3();
  const pos = new Vector3(0, 0, 0);
  const vel = new Vector3(10, 0, 0); // units/sec, world-space
  extrapolatePosition(out, pos, vel, 200); // 0.2s -> +2 on x
  assert.ok(Math.abs(out.x - 2) < 1e-9);
  assert.equal(out.y, 0);
  assert.equal(out.z, 0);
});

test('extrapolatePosition is a no-op at age 0', () => {
  const out = new Vector3();
  extrapolatePosition(out, new Vector3(5, 6, 7), new Vector3(9, 9, 9), 0);
  assert.deepEqual([out.x, out.y, out.z], [5, 6, 7]);
});

test('extrapolateRotation is identity at age 0', () => {
  const out = new Quaternion();
  const r = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
  extrapolateRotation(out, r, new Vector3(0, 0, 0), 0);
  assert.ok(Math.abs(out.x - r.x) < 1e-9);
  assert.ok(Math.abs(out.w - r.w) < 1e-9);
});

test('extrapolateRotation advances about the angular-velocity axis', () => {
  const out = new Quaternion();
  const start = new Quaternion(); // identity
  const angVel = new Vector3(0, 1, 0); // 1 rad/s about +y
  extrapolateRotation(out, start, angVel, 500); // 0.5s -> 0.5 rad about y
  const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
  assert.ok(Math.abs(out.y - expected.y) < 1e-6);
  assert.ok(Math.abs(out.w - expected.w) < 1e-6);
});

test('extrapolateRotation applies world-frame delta (premultiply)', () => {
  const out = new Quaternion();
  const start = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5);
  const angVel = new Vector3(0, 1, 0); // 1 rad/s about world +y
  extrapolateRotation(out, start, angVel, 500); // 0.5s -> 0.5 rad about y
  const delta = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
  const expected = delta.clone().multiply(start); // world-frame: delta * start
  assert.ok(Math.abs(out.x - expected.x) < 1e-6);
  assert.ok(Math.abs(out.y - expected.y) < 1e-6);
  assert.ok(Math.abs(out.z - expected.z) < 1e-6);
  assert.ok(Math.abs(out.w - expected.w) < 1e-6);
});

test('extrapolateRotation is alias-safe when out === rotation', () => {
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5);
  const orig = q.clone();
  const angVel = new Vector3(0, 1, 0);
  extrapolateRotation(q, q, angVel, 500); // out and rotation are the same object
  const delta = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
  const expected = delta.clone().multiply(orig);
  assert.ok(Math.abs(q.x - expected.x) < 1e-6);
  assert.ok(Math.abs(q.y - expected.y) < 1e-6);
  assert.ok(Math.abs(q.z - expected.z) < 1e-6);
  assert.ok(Math.abs(q.w - expected.w) < 1e-6);
});

test('snapshotAge returns MAX_EXTRAP_MS exactly at the ceiling', () => {
  assert.equal(snapshotAge(1000 + MAX_EXTRAP_MS, 1000, true), MAX_EXTRAP_MS);
});
