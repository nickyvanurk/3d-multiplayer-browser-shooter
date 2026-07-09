import { Vector3, Quaternion } from 'three';

type Rng = () => number;

// Ship forward is local +Z: bullets spawn with velocity (0,0,speed) and the
// weapon aims down this axis (shared/sim/entities/bullet.ts).
export const FORWARD = new Vector3(0, 0, 1);

// Cap a vector's magnitude in place, preserving direction. The single most
// important "feel" limiter for steering — it bounds how hard a ship can turn.
export function truncate(v: Vector3, max: number): Vector3 {
  const len = v.length();
  if (len > max && len > 0) {
    v.multiplyScalar(max / len);
  }
  return v;
}

// Solve for the point a finite-speed projectile should aim at to hit a target
// moving at constant velocity — the quadratic intercept. Returns null when the
// target outruns the bullet (no real positive solution); callers fall back to
// raw pursuit. This lead is the core behavior that makes the bot "seem smart".
export function leadIntercept(
  shooterPos: Vector3,
  shooterVel: Vector3,
  targetPos: Vector3,
  targetVel: Vector3,
  projectileSpeed: number,
): Vector3 | null {
  const delta = new Vector3().subVectors(targetPos, shooterPos);
  const vr = new Vector3().subVectors(targetVel, shooterVel);

  const a = vr.dot(vr) - projectileSpeed * projectileSpeed;
  const b = 2 * vr.dot(delta);
  const c = delta.dot(delta);

  let t: number;
  if (Math.abs(a) < 1e-9) {
    // Target closes/opens at exactly bullet speed: linear solve b*t + c = 0.
    if (Math.abs(b) < 1e-9) {
      return targetPos.clone();
    }
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      return null;
    }
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    // Smallest strictly-positive time of flight.
    t = Math.min(t1, t2);
    if (t <= 0) {
      t = Math.max(t1, t2);
    }
  }

  if (t <= 0 || !Number.isFinite(t)) {
    return null;
  }
  return targetPos.clone().addScaledVector(targetVel, t);
}

// Rotate `current` so its forward axis turns toward `targetDir`, but by no more
// than `maxRad` this tick. Within the cap it snaps exactly onto the target.
export function slewQuaternionToward(
  current: Quaternion,
  targetDir: Vector3,
  maxRad: number,
): Quaternion {
  const dir = targetDir.clone().normalize();
  if (dir.lengthSq() === 0) {
    return current.clone();
  }
  const forward = FORWARD.clone().applyQuaternion(current);
  const angle = forward.angleTo(dir);
  if (angle < 1e-6) {
    return current.clone();
  }

  let axis = new Vector3().crossVectors(forward, dir);
  if (axis.lengthSq() < 1e-12) {
    // Exactly opposed: pick any axis perpendicular to forward.
    axis = new Vector3().crossVectors(forward, new Vector3(0, 1, 0));
    if (axis.lengthSq() < 1e-12) {
      axis = new Vector3().crossVectors(forward, new Vector3(1, 0, 0));
    }
  }
  axis.normalize();

  const step = Math.min(angle, maxRad);
  const delta = new Quaternion().setFromAxisAngle(axis, step);
  // Premultiply: rotate in world space so `step` degrees carry `forward` toward
  // `dir` regardless of the ship's current twist/roll.
  return delta.multiply(current);
}

// Deflect a unit direction by a Gaussian angular error (Box-Muller), with a
// uniformly random azimuth around it. Models a human's imperfect aim: most
// shots land close, a few stray wide. Returns a fresh unit vector.
export function gaussianConeError(
  dir: Vector3,
  sigmaRad: number,
  rng: Rng,
): Vector3 {
  const d = dir.clone().normalize();
  if (sigmaRad <= 0) {
    return d;
  }
  // Box-Muller: one standard-normal sample scaled by sigma = the cone angle.
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const angle = gauss * sigmaRad;
  const azimuth = rng() * Math.PI * 2;

  // Build a basis perpendicular to d, then rotate d by `angle` around a random
  // in-plane axis (the azimuth chooses which perpendicular direction).
  let ref = new Vector3(0, 1, 0);
  if (Math.abs(d.dot(ref)) > 0.99) {
    ref = new Vector3(1, 0, 0);
  }
  const perp1 = new Vector3().crossVectors(d, ref).normalize();
  const perp2 = new Vector3().crossVectors(d, perp1).normalize();
  const axis = perp1
    .multiplyScalar(Math.cos(azimuth))
    .addScaledVector(perp2, Math.sin(azimuth))
    .normalize();

  const q = new Quaternion().setFromAxisAngle(axis, angle);
  return d.applyQuaternion(q).normalize();
}

// --- Reynolds steering primitives. Each returns a desired velocity vector. ---

export function seek(pos: Vector3, target: Vector3, maxSpeed: number): Vector3 {
  return new Vector3()
    .subVectors(target, pos)
    .normalize()
    .multiplyScalar(maxSpeed);
}

// Seek, but ease off inside `slowRadius` so the ship settles at the target
// instead of overshooting/ramming it (used to hold optimal weapon range).
export function arrive(
  pos: Vector3,
  target: Vector3,
  maxSpeed: number,
  slowRadius: number,
): Vector3 {
  const toTarget = new Vector3().subVectors(target, pos);
  const dist = toTarget.length();
  if (dist < 1e-6) {
    return new Vector3();
  }
  const speed = dist < slowRadius ? maxSpeed * (dist / slowRadius) : maxSpeed;
  return toTarget.multiplyScalar(speed / dist);
}

// Seek the target's predicted future position (linear extrapolation). Makes a
// chase curve toward where the target is going, not where it was.
export function pursue(
  pos: Vector3,
  target: Vector3,
  targetVel: Vector3,
  maxSpeed: number,
): Vector3 {
  const dist = pos.distanceTo(target);
  const lookAhead = dist / Math.max(maxSpeed, 1e-6);
  const future = target.clone().addScaledVector(targetVel, lookAhead);
  return seek(pos, future, maxSpeed);
}

// Flee the target's predicted future position: the mirror of pursue, for evasion.
export function evade(
  pos: Vector3,
  target: Vector3,
  targetVel: Vector3,
  maxSpeed: number,
): Vector3 {
  const dist = pos.distanceTo(target);
  const lookAhead = dist / Math.max(maxSpeed, 1e-6);
  const future = target.clone().addScaledVector(targetVel, lookAhead);
  return seek(pos, future, maxSpeed).negate();
}

export interface SphereObstacle {
  center: Vector3;
  radius: number;
}

// Cast a forward feeler along `vel`; if it would enter an obstacle's padded
// sphere, return a lateral steering push away from that obstacle (weighted by
// imminence). Returns null when the path is clear — so avoidance only kicks in
// on an actual near-hit and the bot doesn't hug obstacles in open space.
export function feelerAvoid(
  pos: Vector3,
  vel: Vector3,
  obstacles: SphereObstacle[],
  feelerLength: number,
  shipRadius: number,
  maxForce: number,
): Vector3 | null {
  const speed = vel.length();
  if (speed < 1e-6) {
    return null;
  }
  const dir = vel.clone().multiplyScalar(1 / speed);

  let worst: SphereObstacle | null = null;
  let worstProj = Infinity;
  for (const o of obstacles) {
    const toObs = new Vector3().subVectors(o.center, pos);
    const proj = toObs.dot(dir); // distance ahead along the feeler
    if (proj <= 0 || proj > feelerLength) {
      continue;
    }
    // Perpendicular distance from the feeler line to the obstacle center.
    const closest = pos.clone().addScaledVector(dir, proj);
    const lateral = closest.distanceTo(o.center);
    if (lateral < o.radius + shipRadius && proj < worstProj) {
      worst = o;
      worstProj = proj;
    }
  }

  if (!worst) {
    return null;
  }

  // Steer away from the obstacle center, laterally to the feeler. Closer hits
  // (smaller proj) push harder.
  const toObs = new Vector3().subVectors(worst.center, pos);
  const alongComponent = dir.clone().multiplyScalar(toObs.dot(dir));
  const lateralDir = new Vector3().subVectors(toObs, alongComponent);
  if (lateralDir.lengthSq() < 1e-9) {
    // Head-on: pick an arbitrary perpendicular to slide around.
    lateralDir.crossVectors(dir, new Vector3(0, 1, 0));
    if (lateralDir.lengthSq() < 1e-9) {
      lateralDir.crossVectors(dir, new Vector3(1, 0, 0));
    }
  }
  lateralDir.normalize().negate();
  const imminence = 1 - worstProj / feelerLength;
  return lateralDir.multiplyScalar(maxForce * (0.5 + 0.5 * imminence));
}
