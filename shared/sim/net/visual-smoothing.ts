import { type Vector3, Quaternion } from 'three';

// Fiedler-style render-layer error reduction. The physics body is snapped hard
// to the authoritative server state each correction; the visible discontinuity
// is converted into a per-entity error offset that is added to the rendered pose
// and decayed toward zero, so corrections glide instead of popping.
// Reference: Glenn Fiedler, "State Synchronization" (gafferongames.com).

export interface SmoothingConfig {
  // Position error at/below smallDist decays with smallFactor (slow, invisible);
  // at/above largeDist decays with largeFactor (fast recovery); linear between.
  smallDist: number;
  largeDist: number;
  smallFactor: number; // per-60fps-frame retained fraction for small errors
  largeFactor: number; // per-60fps-frame retained fraction for large errors
  // Orientation slerp-to-identity amount per 60fps frame, blended small->large
  // as the error angle grows.
  rotSmall: number;
  rotLarge: number;
  // A correction whose resulting position error exceeds this snaps instead of
  // smoothing (e.g. a respawn across the map).
  teleport: number;
}

// Defaults in voidfall world units. Tunable live via the F3 debug panel.
export const SMOOTHING: SmoothingConfig = {
  smallDist: 1,
  largeDist: 15,
  smallFactor: 0.95,
  largeFactor: 0.85,
  rotSmall: 0.1,
  rotLarge: 0.25,
  teleport: 100,
};

const FRAME_MS = 1000 / 60;
const IDENTITY = new Quaternion();
const _visualRot = new Quaternion();

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Convert a correction pop into an updated error offset so the rendered pose
// (newPos + errPos, newRot * errRot) is visually unchanged this frame. Mutates
// errPos/errRot in place. If the resulting position error exceeds `teleport`,
// zero both so the entity snaps rather than smearing across the screen.
export function captureError(
  errPos: Vector3,
  errRot: Quaternion,
  oldPos: Vector3,
  oldRot: Quaternion,
  newPos: Vector3,
  newRot: Quaternion,
  teleport: number,
): void {
  // errPos becomes visualPos - newPos, where visualPos = oldPos + errPos.
  errPos.add(oldPos).sub(newPos);
  if (errPos.lengthSq() > teleport * teleport) {
    errPos.set(0, 0, 0);
    errRot.identity();
    return;
  }
  // visualRot = oldRot * errRot ; new errRot = inverse(newRot) * visualRot,
  // so that newRot * errRot == visualRot.
  _visualRot.copy(oldRot).multiply(errRot);
  errRot.copy(newRot).invert().multiply(_visualRot).normalize();
}

// Shrink the error toward zero/identity, framerate-independently (the per-60fps
// factor is raised to dt/frame). Adaptive: larger errors decay faster. Mutates
// errPos/errRot in place.
export function decayError(
  errPos: Vector3,
  errRot: Quaternion,
  dtMs: number,
  cfg: SmoothingConfig = SMOOTHING,
): void {
  const exp = dtMs / FRAME_MS;

  const dist = errPos.length();
  const pt = clamp01((dist - cfg.smallDist) / (cfg.largeDist - cfg.smallDist));
  const factor = cfg.smallFactor + (cfg.largeFactor - cfg.smallFactor) * pt;
  errPos.multiplyScalar(factor ** exp);

  // errRot.w = cos(halfAngle): |w|->1 is near identity. Blend the slerp amount
  // from small->large as the error angle grows.
  const angle = 2 * Math.acos(Math.min(1, Math.abs(errRot.w)));
  const rt = clamp01(angle / (Math.PI * 0.5));
  const amount = cfg.rotSmall + (cfg.rotLarge - cfg.rotSmall) * rt;
  const scaled = 1 - (1 - amount) ** exp;
  errRot.slerp(IDENTITY, scaled);
}
