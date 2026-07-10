import { Vector3 } from 'three';
import Types from '../types.ts';
import type { Entity } from './entity.ts';

// The slice of the world spawn selection reads: it only needs to scan entities
// (asteroids to dodge, ships to spread away from). ReadonlyMap so any world —
// server World, the respawn subsystem's view — satisfies it.
export interface SpawnWorld {
  entities: ReadonlyMap<number, Entity>;
}

type Rng = () => number;

// Ships spawn and respawn somewhere inside this sphere around the origin: spread
// across the field rather than the old origin cluster, but tight enough that a
// handful of ships still run into each other.
export const SPAWN_RADIUS = 1000;

// Bounding radius of asteroid.glb at scale 1 — the largest model vertex distance
// from its centre, measured off the server collision mesh. An asteroid's world
// radius is this times its transform.scale.
export const ASTEROID_HULL_RADIUS = 1.63;

// Candidate points sampled per pick; the best (clear of rock, farthest from other
// ships) wins. More candidates = better spread for more work.
const CANDIDATE_COUNT = 16;

// Clear space kept between a spawned ship's centre and the nearest asteroid
// surface, so ships never appear touching (or inside) rock.
const MIN_ASTEROID_GAP = 40;

// Uniform point by volume inside a sphere: a uniform direction times a
// cube-root-distributed radius.
function randomPointInSphere(radius: number, rng: Rng): Vector3 {
  const cosTheta = rng() * 2 - 1;
  const phi = rng() * Math.PI * 2;
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const r = radius * Math.cbrt(rng());
  return new Vector3(
    sinTheta * Math.cos(phi) * r,
    sinTheta * Math.sin(phi) * r,
    cosTheta * r,
  );
}

// Gap from a point to the nearest asteroid surface (Infinity if there are none).
// Negative means the point is inside that asteroid.
function nearestAsteroidGap(world: SpawnWorld, point: Vector3): number {
  let gap = Infinity;
  for (const entity of world.entities.values()) {
    if (entity.type !== Types.Entities.ASTEROID) {
      continue;
    }
    const surface =
      point.distanceTo(entity.transform.position) -
      ASTEROID_HULL_RADIUS * entity.transform.scale;
    if (surface < gap) {
      gap = surface;
    }
  }
  return gap;
}

// Distance to the nearest OTHER alive ship (Infinity if none).
export function nearestShipDistance(
  world: SpawnWorld,
  point: Vector3,
  exclude?: Entity,
): number {
  let nearest = Infinity;
  for (const entity of world.entities.values()) {
    if (entity.type !== Types.Entities.SPACESHIP) {
      continue;
    }
    if (entity === exclude || entity.alive === false) {
      continue;
    }
    const d = point.distanceTo(entity.transform.position);
    if (d < nearest) {
      nearest = d;
    }
  }
  return nearest;
}

// Choose a spawn point inside SPAWN_RADIUS that clears every asteroid and sits as
// far as possible from other ships. Samples CANDIDATE_COUNT points and keeps the
// best; if none clear the field (vanishingly unlikely) the roomiest candidate
// wins, so a usable point is always returned. `exclude` is the entity being
// (re)spawned, ignored when scoring crowding so it doesn't hug its own position.
export function pickSpawnPosition(
  world: SpawnWorld,
  rng: Rng = Math.random,
  exclude?: Entity,
): Vector3 {
  let best: Vector3 | null = null;
  let bestShipDistance = -Infinity;
  // Roomiest = candidate with the largest asteroid gap, used as a fallback when
  // none clear MIN_ASTEROID_GAP.
  let roomiest: Vector3 | null = null;
  let roomiestGap = -Infinity;

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const candidate = randomPointInSphere(SPAWN_RADIUS, rng);
    const gap = nearestAsteroidGap(world, candidate);

    if (gap > roomiestGap) {
      roomiestGap = gap;
      roomiest = candidate;
    }
    if (gap < MIN_ASTEROID_GAP) {
      continue;
    }

    const shipDistance = nearestShipDistance(world, candidate, exclude);
    if (shipDistance > bestShipDistance) {
      bestShipDistance = shipDistance;
      best = candidate;
    }
  }

  // roomiest is non-null: CANDIDATE_COUNT >= 1 so the loop always sets it.
  return best ?? (roomiest as Vector3);
}
