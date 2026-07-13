import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { test } from './harness.ts';
import {
  PRECISION,
  POSITION_BIAS,
  POSITION_MAX,
  QUAT_MAX,
  VELOCITY_RANGE,
  ANGULAR_VELOCITY_RANGE,
  quantizePos,
  dequantizePos,
  quantizeVel,
  dequantizeVel,
  encodeQuat,
  decodeQuat,
  snapPosition,
  snapRotation,
  snapVelocity,
  quantizeState,
  dequantizeState,
} from '../../shared/sim/net/quantize.ts';

const MAX_POS = (POSITION_MAX - POSITION_BIAS) * PRECISION; // +104857.5
const MIN_POS = -POSITION_BIAS * PRECISION; // -104857.6

test('quantizePos round-trips within half a grid cell across the range', () => {
  for (const v of [0, 0.1, -0.1, 12.34, -9999.9, 24000, MAX_POS, MIN_POS]) {
    const q = quantizePos(v);
    assert.ok(q >= 0 && q <= POSITION_MAX, `bucket ${q} in range for ${v}`);
    assert.ok(
      Math.abs(dequantizePos(q) - v) <= PRECISION / 2 + 1e-9,
      `pos ${v} -> ${dequantizePos(q)} within 5cm`,
    );
  }
});

test('quantizePos clamps beyond the representable range', () => {
  assert.equal(quantizePos(MAX_POS + 1000), POSITION_MAX);
  assert.equal(quantizePos(MIN_POS - 1000), 0);
});

test('quantizePos is idempotent through the grid', () => {
  for (const v of [3.14159, -2.71828, 1000.05]) {
    const once = dequantizePos(quantizePos(v));
    assert.equal(quantizePos(dequantizePos(quantizePos(v))), quantizePos(once));
    // snapping an already-snapped value is a fixed point
    assert.equal(dequantizePos(quantizePos(once)), once);
  }
});

test('quantizeVel round-trips within a step and clamps out of range', () => {
  const R = VELOCITY_RANGE;
  const step = (2 * R) / 65535;
  for (const v of [0, 1.5, -3.2, R, -R]) {
    const back = dequantizeVel(quantizeVel(v, R), R);
    assert.ok(Math.abs(back - v) <= step + 1e-6, `vel ${v} -> ${back}`);
  }
  assert.equal(quantizeVel(R + 100, R), 65535);
  assert.equal(quantizeVel(-R - 100, R), 0);
});

function angleBetween(a: Quaternion, b: Quaternion): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, dot));
}

test('encodeQuat/decodeQuat reconstruct within ~1 degree and stay unit-length', () => {
  const cases = [
    new Quaternion(0, 0, 0, 1),
    new Quaternion(0.1, 0.2, 0.3, 0.4).normalize(),
    new Quaternion(-0.5, 0.5, -0.5, 0.5).normalize(),
    new Quaternion(0.7071, 0, 0, 0.7071).normalize(),
    new Quaternion(1, 2, 3, 4).normalize(),
  ];
  for (const q of cases) {
    const { index, a, b, c } = encodeQuat(q);
    assert.ok(index >= 0 && index <= 3);
    for (const bucket of [a, b, c]) {
      assert.ok(bucket >= 0 && bucket <= QUAT_MAX);
    }
    const out = decodeQuat(index, a, b, c);
    assert.ok(Math.abs(out.length() - 1) < 1e-6, 'decoded quat is unit-length');
    assert.ok(
      angleBetween(q, out) < 0.03,
      `rotation error ${angleBetween(q, out)} rad`,
    );
  }
});

test('q and -q encode identically (double-cover resolved)', () => {
  const q = new Quaternion(0.2, -0.5, 0.3, 0.6).normalize();
  const neg = new Quaternion(-q.x, -q.y, -q.z, -q.w);
  assert.deepEqual(encodeQuat(q), encodeQuat(neg));
});

test('decode->encode is a fixed point at the bucket level', () => {
  const q = new Quaternion(0.3, 0.1, -0.2, 0.9).normalize();
  const first = encodeQuat(q);
  const roundTripped = encodeQuat(
    decodeQuat(first.index, first.a, first.b, first.c),
  );
  assert.deepEqual(roundTripped, first);
});

test('snap helpers mutate in place and are idempotent', () => {
  const p = new Vector3(12.37, -4.02, 100.081);
  snapPosition(p);
  const p2 = p.clone();
  snapPosition(p2);
  assert.deepEqual([p2.x, p2.y, p2.z], [p.x, p.y, p.z]);

  const v = new Vector3(3.333, -1.111, 0.5);
  snapVelocity(v, VELOCITY_RANGE);
  const v2 = v.clone();
  snapVelocity(v2, VELOCITY_RANGE);
  assert.deepEqual([v2.x, v2.y, v2.z], [v.x, v.y, v.z]);

  const r = new Quaternion(0.4, -0.2, 0.5, 0.7).normalize();
  snapRotation(r);
  const r2 = r.clone();
  snapRotation(r2);
  assert.ok(angleBetween(r, r2) < 1e-6, 'snapRotation is a fixed point');
});

test('a quantized wire value is a fixed point both sims agree on', () => {
  // The client sends a pose (quantizeState); the server dequantizes and applies
  // it, then re-serializes for the next snapshot (quantizeState again). Both must
  // land on identical buckets — that is what "both sides simulate from the same
  // data" means: the wire value is a stable grid point neither side drifts off.
  const floatState = [
    12.34, -5.67, 100.9, 0.1, 0.2, 0.3, 0.9, 3.2, -1.1, 0.4, 0.05, -0.02, 0.9,
    260, 87, 4,
  ];
  const buckets = quantizeState(floatState);
  const d = dequantizeState(buckets);
  const reencoded = quantizeState([
    d.position.x,
    d.position.y,
    d.position.z,
    d.rotation.x,
    d.rotation.y,
    d.rotation.z,
    d.rotation.w,
    d.velocity.x,
    d.velocity.y,
    d.velocity.z,
    d.angularVelocity.x,
    d.angularVelocity.y,
    d.angularVelocity.z,
    d.input,
    d.health,
    d.level,
  ]);
  assert.deepEqual(reencoded, buckets);
});

test('angular velocity uses its own range', () => {
  const back = dequantizeVel(
    quantizeVel(5, ANGULAR_VELOCITY_RANGE),
    ANGULAR_VELOCITY_RANGE,
  );
  assert.ok(Math.abs(back - 5) < 0.01);
});
