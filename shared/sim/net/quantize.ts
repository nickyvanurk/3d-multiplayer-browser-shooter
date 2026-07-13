import { Vector3, Quaternion } from 'three';

// Fixed-point / smallest-three quantization of physics state (Fiedler's snapshot
// compression). Both the wire encoder and the simulation snap through these so
// server and client only ever hold values on the same discrete grid.

// Position: 21 bits/axis, 0.1 m resolution → ±104857.6 m (~209.7 km) range.
export const PRECISION = 0.1;
export const POSITION_BITS = 21;
export const POSITION_MAX = (1 << POSITION_BITS) - 1; // 2097151
export const POSITION_BIAS = 1 << (POSITION_BITS - 1); // 1048576 (zero point)

// Quaternion smallest-three: drop the largest component, send the other three
// scaled into [-1/√2, +1/√2] at 9 bits each, plus a 2-bit index.
export const QUAT_COMPONENT_BITS = 9;
export const QUAT_MAX = (1 << QUAT_COMPONENT_BITS) - 1; // 511
export const QUAT_MIN = -Math.SQRT1_2;
export const QUAT_RANGE = 2 * Math.SQRT1_2;

// Velocity: 16 bits/axis over a symmetric bounded range. Placeholder magnitudes —
// must exceed real ship speed caps + bump-impulse peaks (verify before merge).
export const VELOCITY_BITS = 16;
export const VELOCITY_MAX = (1 << VELOCITY_BITS) - 1; // 65535
export const VELOCITY_RANGE = 1024; // m/s
export const ANGULAR_VELOCITY_RANGE = 32; // rad/s

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function quantizePos(v: number): number {
  return clampInt(Math.round(v / PRECISION) + POSITION_BIAS, 0, POSITION_MAX);
}

export function dequantizePos(q: number): number {
  return (q - POSITION_BIAS) * PRECISION;
}

export function quantizeVel(v: number, range: number): number {
  const clamped = v < -range ? -range : v > range ? range : v;
  return clampInt(
    Math.round(((clamped + range) / (2 * range)) * VELOCITY_MAX),
    0,
    VELOCITY_MAX,
  );
}

export function dequantizeVel(q: number, range: number): number {
  return (q / VELOCITY_MAX) * (2 * range) - range;
}

// Encode a rotation as {largest-component index, three 9-bit buckets}. The largest
// component is forced positive so a quaternion and its negation (same rotation)
// encode identically.
export function encodeQuat(q: Quaternion): {
  index: number;
  a: number;
  b: number;
  c: number;
} {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const comps = [q.x / len, q.y / len, q.z / len, q.w / len];

  let index = 0;
  let maxAbs = Math.abs(comps[0]);
  for (let i = 1; i < 4; i++) {
    const abs = Math.abs(comps[i]);
    if (abs > maxAbs) {
      maxAbs = abs;
      index = i;
    }
  }

  const sign = comps[index] < 0 ? -1 : 1;
  const buckets: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === index) {
      continue;
    }
    const c = sign * comps[i];
    buckets.push(
      clampInt(
        Math.round(((c - QUAT_MIN) / QUAT_RANGE) * QUAT_MAX),
        0,
        QUAT_MAX,
      ),
    );
  }

  return { index, a: buckets[0], b: buckets[1], c: buckets[2] };
}

export function decodeQuat(
  index: number,
  a: number,
  b: number,
  c: number,
  out = new Quaternion(),
): Quaternion {
  const buckets = [a, b, c];
  const comps = [0, 0, 0, 0];
  let sumSq = 0;
  let j = 0;
  for (let i = 0; i < 4; i++) {
    if (i === index) {
      continue;
    }
    const v = QUAT_MIN + (buckets[j++] / QUAT_MAX) * QUAT_RANGE;
    comps[i] = v;
    sumSq += v * v;
  }
  comps[index] = Math.sqrt(Math.max(0, 1 - sumSq));
  return out.set(comps[0], comps[1], comps[2], comps[3]).normalize();
}

export function snapPosition(v: Vector3): Vector3 {
  v.x = dequantizePos(quantizePos(v.x));
  v.y = dequantizePos(quantizePos(v.y));
  v.z = dequantizePos(quantizePos(v.z));
  return v;
}

export function snapVelocity(v: Vector3, range: number): Vector3 {
  v.x = dequantizeVel(quantizeVel(v.x, range), range);
  v.y = dequantizeVel(quantizeVel(v.y, range), range);
  v.z = dequantizeVel(quantizeVel(v.z, range), range);
  return v;
}

export function snapRotation(q: Quaternion): Quaternion {
  const { index, a, b, c } = encodeQuat(q);
  return decodeQuat(index, a, b, c, q);
}

const _quatScratch = new Quaternion();

// Convert the 16-number float network state (Entity.serializeNetworkState layout
// [px,py,pz, rx,ry,rz,rw, vx,vy,vz, ax,ay,az, input, health, level]) into 16
// quantized integer buckets (layout [px,py,pz, qIndex,qa,qb,qc, vx,vy,vz,
// ax,ay,az, input, health, level]). Used for both the wire encoding and the
// snapshot differ's change key, so sub-grid jitter no longer counts as a change.
export function quantizeState(s: number[]): number[] {
  const q = encodeQuat(_quatScratch.set(s[3], s[4], s[5], s[6]));
  return [
    quantizePos(s[0]),
    quantizePos(s[1]),
    quantizePos(s[2]),
    q.index,
    q.a,
    q.b,
    q.c,
    quantizeVel(s[7], VELOCITY_RANGE),
    quantizeVel(s[8], VELOCITY_RANGE),
    quantizeVel(s[9], VELOCITY_RANGE),
    quantizeVel(s[10], ANGULAR_VELOCITY_RANGE),
    quantizeVel(s[11], ANGULAR_VELOCITY_RANGE),
    quantizeVel(s[12], ANGULAR_VELOCITY_RANGE),
    clampInt(Math.round(s[13] || 0), 0, 0xffff),
    clampInt(Math.round(s[14] || 0), 0, 0xffff),
    clampInt(Math.round(s[15] || 0), 0, 0xff),
  ];
}

export interface DequantizedState {
  position: Vector3;
  rotation: Quaternion;
  velocity: Vector3;
  angularVelocity: Vector3;
  input: number;
  health: number;
  level: number;
}

export function dequantizeState(s: number[]): DequantizedState {
  return {
    position: new Vector3(
      dequantizePos(s[0]),
      dequantizePos(s[1]),
      dequantizePos(s[2]),
    ),
    rotation: decodeQuat(s[3], s[4], s[5], s[6]),
    velocity: new Vector3(
      dequantizeVel(s[7], VELOCITY_RANGE),
      dequantizeVel(s[8], VELOCITY_RANGE),
      dequantizeVel(s[9], VELOCITY_RANGE),
    ),
    angularVelocity: new Vector3(
      dequantizeVel(s[10], ANGULAR_VELOCITY_RANGE),
      dequantizeVel(s[11], ANGULAR_VELOCITY_RANGE),
      dequantizeVel(s[12], ANGULAR_VELOCITY_RANGE),
    ),
    input: s[13],
    health: s[14],
    level: s[15],
  };
}
