import { Vector3, Quaternion } from 'three';
import Types from '../../types.ts';

// Bullets store local +z forward velocity (no physics body); everything with a
// body reports world-space linvel already.
export function resolveWorldVelocity(
  out: Vector3,
  entityType: number,
  velocity: Vector3,
  rotation: Quaternion,
): Vector3 {
  if (entityType === Types.Entities.BULLET) {
    return out.copy(velocity).applyQuaternion(rotation);
  }
  return out.copy(velocity);
}

// Never extrapolate a remote entity more than this far past its snapshot: a GC
// pause, a backgrounded tab, or a wildly wrong early clock delta could otherwise
// fling it across the map.
export const MAX_EXTRAP_MS = 250;

// How far (ms) a snapshot's server time lags the current synced server clock.
// Floored at 0 (never rewind) and clamped to MAX_EXTRAP_MS. Returns 0 while the
// clock is unsynced so callers fall back to a raw snap.
export function snapshotAge(
  serverNow: number,
  serverTime: number,
  synced: boolean,
): number {
  if (!synced) return 0;
  const age = serverNow - serverTime;
  if (age <= 0) return 0;
  return age > MAX_EXTRAP_MS ? MAX_EXTRAP_MS : age;
}

// out = position + worldVelocity * (ageMs / 1000). `worldVelocity` must already
// be in world space (see resolveWorldVelocity below).
export function extrapolatePosition(
  out: Vector3,
  position: Vector3,
  worldVelocity: Vector3,
  ageMs: number,
): Vector3 {
  return out.copy(position).addScaledVector(worldVelocity, ageMs / 1000);
}

// out = rotation advanced by angularVelocity (world-space rad/s) over ageMs. The
// delta quaternion is premultiplied (world-space angular velocity).
const _axis = new Vector3();
const _delta = new Quaternion();
export function extrapolateRotation(
  out: Quaternion,
  rotation: Quaternion,
  angularVelocity: Vector3,
  ageMs: number,
): Quaternion {
  const dt = ageMs / 1000;
  const speed = angularVelocity.length();
  if (speed < 1e-9 || dt === 0) {
    return out.copy(rotation);
  }
  _axis.copy(angularVelocity).divideScalar(speed);
  _delta.setFromAxisAngle(_axis, speed * dt);
  return out.copy(rotation).premultiply(_delta);
}
