import assert from 'node:assert/strict';
import { test } from './harness.ts';
import {
  screenToNdc,
  screenToSteering,
} from '../../client/src/input/aim-math.ts';

const W = 1920;
const H = 1080; // 16:9, aspect 1.777...

test('screenToNdc maps screen center to the origin', () => {
  const c = screenToNdc(W / 2, H / 2, W, H);
  assert.ok(Math.abs(c.x) < 1e-9, `x=${c.x}`);
  assert.ok(Math.abs(c.y) < 1e-9, `y=${c.y}`);
});

test('screenToNdc spans each axis by its own dimension (no aspect skew)', () => {
  // 3/4 across horizontally must be exactly 0.5 in NDC, regardless of aspect.
  assert.ok(Math.abs(screenToNdc(W * 0.75, H / 2, W, H).x - 0.5) < 1e-9);
  // Left/right edges map to -1 / +1.
  assert.ok(Math.abs(screenToNdc(0, H / 2, W, H).x + 1) < 1e-9);
  assert.ok(Math.abs(screenToNdc(W, H / 2, W, H).x - 1) < 1e-9);
});

test('screenToNdc flips y (screen-down pixels -> ndc-up)', () => {
  assert.equal(screenToNdc(W / 2, 0, W, H).y, 1); // top of screen
  assert.equal(screenToNdc(W / 2, H, W, H).y, -1); // bottom of screen
});

test('screenToNdc diverges from the steering value off-center (the bug)', () => {
  // The old code fed the steering value into the raycaster. Off-center they
  // must differ substantially, else the aim ray skews toward the screen edge.
  const ndc = screenToNdc(W * 0.75, H / 2, W, H);
  const steer = screenToSteering(W * 0.75, H / 2, W, H);
  assert.ok(
    Math.abs(ndc.x - steer.x) > 0.3,
    `ndc.x=${ndc.x} steer.x=${steer.x}`,
  );
});

test('screenToSteering keeps aspect-normalized, clamped, numeric behavior', () => {
  assert.deepEqual(screenToSteering(W / 2, H / 2, W, H), { x: 0, y: 0 });
  // Saturates to 1 before the right edge (intended for steering deflection).
  assert.equal(screenToSteering(W * 0.9, H / 2, W, H).x, 1);
  // Must be a number, not a toFixed() string (old regression).
  assert.equal(typeof screenToSteering(W * 0.6, H / 2, W, H).x, 'number');
});
