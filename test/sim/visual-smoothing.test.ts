import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import {
  captureError,
  decayError,
  SMOOTHING,
  type SmoothingConfig,
} from '../../shared/sim/net/visual-smoothing.ts';
import { test } from './harness.ts';

const cfg: SmoothingConfig = {
  smallDist: 1,
  largeDist: 15,
  smallFactor: 0.95,
  largeFactor: 0.85,
  rotSmall: 0.1,
  rotLarge: 0.25,
  teleport: 100,
};

// captureError converts a correction pop into an offset so the rendered pose
// (newPos + errorPos) equals the pre-correction visual pose (oldPos + errorPos).
test('captureError keeps the visual position continuous across a correction', () => {
  const errPos = new Vector3(2, 0, 0); // current offset
  const errRot = new Quaternion();
  const oldPos = new Vector3(0, 0, 0);
  const oldRot = new Quaternion();
  const newPos = new Vector3(10, 0, 0); // server yanks it to x=10
  const newRot = new Quaternion();

  const visualBefore = oldPos.clone().add(errPos); // (2,0,0)
  captureError(errPos, errRot, oldPos, oldRot, newPos, newRot, cfg.teleport);

  const visualAfter = newPos.clone().add(errPos);
  assert.ok(visualAfter.distanceTo(visualBefore) < 1e-9); // mesh does not move
});

test('captureError keeps the visual orientation continuous', () => {
  const errPos = new Vector3();
  const errRot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.2);
  const oldRot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
  const newRot = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.7);
  const oldPos = new Vector3();
  const newPos = new Vector3();

  const visualBefore = oldRot.clone().multiply(errRot); // oldRot * errRot
  captureError(errPos, errRot, oldPos, oldRot, newPos, newRot, cfg.teleport);

  const visualAfter = newRot.clone().multiply(errRot); // newRot * errRot
  assert.ok(Math.abs(visualAfter.x - visualBefore.x) < 1e-6);
  assert.ok(Math.abs(visualAfter.y - visualBefore.y) < 1e-6);
  assert.ok(Math.abs(visualAfter.z - visualBefore.z) < 1e-6);
  assert.ok(Math.abs(visualAfter.w - visualBefore.w) < 1e-6);
});

test('captureError snaps (zeroes the error) when the pop exceeds the teleport threshold', () => {
  const errPos = new Vector3();
  const errRot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1);
  const oldPos = new Vector3(0, 0, 0);
  const oldRot = new Quaternion();
  const newPos = new Vector3(500, 0, 0); // respawn across the map
  const newRot = new Quaternion();

  captureError(errPos, errRot, oldPos, oldRot, newPos, newRot, cfg.teleport);
  assert.equal(errPos.lengthSq(), 0);
  assert.ok(Math.abs(errRot.w - 1) < 1e-9); // identity
});

test('decayError shrinks the position error monotonically toward zero', () => {
  const errPos = new Vector3(5, 0, 0);
  const errRot = new Quaternion();
  let prev = errPos.length();
  for (let i = 0; i < 200; i++) {
    decayError(errPos, errRot, 16.667, cfg);
    const now = errPos.length();
    assert.ok(now < prev); // strictly decreasing
    prev = now;
  }
  assert.ok(prev < 0.01); // essentially gone
});

test('a large error decays faster (smaller retained fraction) than a small one', () => {
  const big = new Vector3(cfg.largeDist * 2, 0, 0); // beyond largeDist
  const small = new Vector3(cfg.smallDist * 0.5, 0, 0); // below smallDist
  const q = new Quaternion();
  const bigBefore = big.length();
  const smallBefore = small.length();
  decayError(big, q.clone(), 16.667, cfg);
  decayError(small, q.clone(), 16.667, cfg);
  const bigRetained = big.length() / bigBefore;
  const smallRetained = small.length() / smallBefore;
  assert.ok(bigRetained < smallRetained); // large error recovers faster
});

test('position decay is framerate-independent (one 33.3ms step == two 16.67ms steps)', () => {
  const q = new Quaternion();
  // Use an error far beyond largeDist so the factor is pinned (constant),
  // making the framerate-independence exact rather than approximate.
  const oneStep = new Vector3(1000, 0, 0);
  const twoStep = new Vector3(1000, 0, 0);
  decayError(oneStep, q.clone(), 33.334, cfg);
  decayError(twoStep, q.clone(), 16.667, cfg);
  decayError(twoStep, q.clone(), 16.667, cfg);
  assert.ok(Math.abs(oneStep.length() - twoStep.length()) < 1e-6);
});

test('decayError drives the orientation error toward identity and leaves identity alone', () => {
  const errPos = new Vector3();
  const errRot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.0);
  for (let i = 0; i < 300; i++) {
    decayError(errPos, errRot, 16.667, cfg);
  }
  assert.ok(Math.abs(Math.abs(errRot.w) - 1) < 1e-3); // ~identity

  const identity = new Quaternion();
  decayError(new Vector3(), identity, 16.667, cfg);
  assert.ok(Math.abs(identity.w - 1) < 1e-9); // identity stays identity
});

test('SMOOTHING config exposes the tunable constants', () => {
  assert.equal(typeof SMOOTHING.smallFactor, 'number');
  assert.equal(typeof SMOOTHING.teleport, 'number');
});
