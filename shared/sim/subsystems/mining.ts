import type { Vector3 } from 'three';
import Types from '../../types.ts';
import type { Entity } from '../entity.ts';
import {
  ORE_PER_CHUNK,
  CHUNK_TTL_MS,
  CHUNK_ARM_MS,
  CHUNK_COLLECT_RADIUS,
  chunksForRange,
  chunkSpawnPosition,
} from '../mining.ts';

// The mining-relevant view of an entity: base Entity plus the fields the
// subsystem duck-types on (present on Asteroid / Ship).
interface MiningEntity extends Entity {
  health?: number;
  maxOre?: number;
  lastImpact?: Vector3;
  cargo?: number;
  cargoCapacity?: number;
}

interface MiningWorld {
  entities: Map<number, MiningEntity>;
}

// One collectible ore chunk broken off an asteroid. NOT a physics body and NOT
// part of the replicated snapshot — the server tracks it to award ore by
// proximity and broadcasts its spawn/collect as small explicit events, because
// its position (the impact point) can't be re-derived from the asteroid alone.
export interface OrePickup {
  id: number;
  position: Vector3;
  // Time before it can be collected (arming), and before it despawns (TTL), ms.
  arm: number;
  ttl: number;
}

// A freshly-spawned chunk to broadcast (OreDrop): its id and where it appeared.
export interface SpawnEvent {
  id: number;
  position: Vector3;
}

// A collected chunk to broadcast (Collect) so clients remove their copy.
export interface CollectEvent {
  id: number;
}

const COLLECT_RADIUS_SQ = CHUNK_COLLECT_RADIUS * CHUNK_COLLECT_RADIUS;

// Server-authoritative mining: watches each asteroid's ore (health) fall and
// breaks off chunks at the impact point of the shot, then awards them to any ship
// that flies close enough with room in its hold. Chunks are non-physical records
// collected by proximity — no colliders, no snapshot; just an ore value, a
// position, and arm/TTL timers.
export class MiningSubsystem {
  pickups: OrePickup[];
  // asteroid id -> ore seen last tick, to detect the drop across a tick even if
  // several hits coalesced into it.
  private prevOre: Map<number, number>;
  private spawned: SpawnEvent[];
  private collected: CollectEvent[];
  private nextId: number;

  constructor() {
    this.pickups = [];
    this.prevOre = new Map();
    this.spawned = [];
    this.collected = [];
    this.nextId = 1;
  }

  update(world: MiningWorld, dt: number): void {
    this.spawnFromDepletion(world);
    this.collectAndExpire(world, dt);
  }

  // Break new chunks off every asteroid whose ore fell this tick, at the impact
  // point combat stamped on it.
  private spawnFromDepletion(world: MiningWorld): void {
    const live = new Set<number>();
    for (const entity of world.entities.values()) {
      if (entity.type !== Types.Entities.ASTEROID) {
        continue;
      }
      live.add(entity.id!);

      const ore = entity.health!;
      const prev = this.prevOre.get(entity.id!) ?? ore;
      // Only a genuine drop breaks chunks; a refill on respawn (ore jumps up) is
      // ignored, and its new baseline is recorded below.
      if (ore < prev) {
        const count = chunksForRange(entity.maxOre!, prev, ore);
        for (let i = 0; i < count; i++) {
          const id = this.nextId++;
          const position = chunkSpawnPosition(
            entity.lastImpact!,
            entity.transform.position,
            id,
          );
          this.pickups.push({
            id,
            position,
            arm: CHUNK_ARM_MS,
            ttl: CHUNK_TTL_MS,
          });
          this.spawned.push({ id, position });
        }
      }
      this.prevOre.set(entity.id!, ore);
    }

    // Forget asteroids that no longer exist so the map can't grow unbounded.
    for (const id of this.prevOre.keys()) {
      if (!live.has(id)) {
        this.prevOre.delete(id);
      }
    }
  }

  // Award armed chunks to nearby ships (authoritative) and age out the rest.
  private collectAndExpire(world: MiningWorld, dt: number): void {
    const kept: OrePickup[] = [];
    for (const pickup of this.pickups) {
      pickup.arm -= dt;
      if (pickup.arm <= 0) {
        const ship = this.nearestCollector(world, pickup.position);
        if (ship) {
          ship.cargo! += ORE_PER_CHUNK;
          this.collected.push({ id: pickup.id });
          continue; // consumed
        }
      }

      pickup.ttl -= dt;
      if (pickup.ttl > 0) {
        kept.push(pickup);
      }
    }
    this.pickups = kept;
  }

  // The nearest alive ship within collect range that still has cargo room, or
  // null. (First-come by proximity; ties resolve to whichever is closest.)
  private nearestCollector(
    world: MiningWorld,
    position: Vector3,
  ): MiningEntity | null {
    let best: MiningEntity | null = null;
    let bestSq = COLLECT_RADIUS_SQ;
    for (const entity of world.entities.values()) {
      if (entity.type !== Types.Entities.SPACESHIP || entity.alive === false) {
        continue;
      }
      if ((entity.cargo ?? 0) + ORE_PER_CHUNK > (entity.cargoCapacity ?? 0)) {
        continue; // hold full
      }
      const dSq = entity.transform.position.distanceToSquared(position);
      if (dSq <= bestSq) {
        bestSq = dSq;
        best = entity;
      }
    }
    return best;
  }

  // Hand freshly-spawned chunks to the network layer to broadcast (OreDrop),
  // clearing them.
  drainSpawned(): SpawnEvent[] {
    const out = this.spawned;
    this.spawned = [];
    return out;
  }

  // Hand collected-chunk events to the network layer to broadcast (Collect),
  // clearing them.
  drainCollected(): CollectEvent[] {
    const out = this.collected;
    this.collected = [];
    return out;
  }
}
