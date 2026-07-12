import type { Vector3 } from 'three';
import { RESPAWN_DELAY } from '../entities/ship.ts';
import { ASTEROID_RESPAWN_DELAY, MINING_DAMAGE_FACTOR } from '../mining.ts';
import type { Entity } from '../entity.ts';

// The combat-relevant view of an entity: base Entity plus the optional
// lifecycle/weapon fields the subsystem duck-types on (present on Ship/Bullet).
interface CombatEntity extends Entity {
  health?: number;
  damage?: number;
  destroyOnCollision?: boolean;
  respawn?: boolean;
  respawnTimer?: number;
  // Asteroids come back in place and much slower than ships (see combat's
  // per-entity delay below). `maxOre` marks a victim as rock: guns chip it at a
  // reduced (mining) rate rather than dealing full combat damage.
  respawnInPlace?: boolean;
  maxOre?: number;
  // Bullets: a per-shot rock-mining multiplier (mining laser >> default). Absent
  // on the cannons, which fall back to the global MINING_DAMAGE_FACTOR.
  miningFactor?: number;
  owner?: Entity | null;
  invulnerable?: boolean;
  // Present on asteroids: stamped with the impact point so mining drops ore where
  // the shot landed. sweepProjectiles moves the bullet onto its exact hit point
  // before recording the collision, so the attacker's position IS that point.
  lastImpact?: Vector3;
}

interface CombatWorld {
  physics: { drainCollisions(): { a: CombatEntity; b: CombatEntity }[] };
  entities: Map<number, CombatEntity>;
}

export class CombatSubsystem {
  update(world: CombatWorld): void {
    const pairs = world.physics.drainCollisions();

    const damaged: Set<CombatEntity> = new Set();
    for (const { a, b } of pairs) {
      // A bullet spawns inside its owner's hull; ignore that collision entirely
      // so it neither damages the firing ship nor self-destructs before it can
      // travel out to hit anything else.
      if (a.owner === b || b.owner === a) {
        continue;
      }

      this.dealDamage(a, b, damaged);
      this.dealDamage(b, a, damaged);

      if (a.destroyOnCollision) {
        a.markDestroyed();
      }
      if (b.destroyOnCollision) {
        b.markDestroyed();
      }
    }

    for (const entity of world.entities.values()) {
      if (typeof entity.health !== 'number' || entity.health > 0) {
        continue;
      }

      if (entity.respawn === true) {
        if (!entity.alive) {
          continue;
        }
        entity.alive = false;
        // Asteroids stay gone for minutes; ships come back in seconds.
        entity.respawnTimer = entity.respawnInPlace
          ? ASTEROID_RESPAWN_DELAY
          : RESPAWN_DELAY;
      } else {
        entity.markDestroyed();
      }
    }
  }

  dealDamage(
    attacker: CombatEntity,
    victim: CombatEntity,
    damaged: Set<CombatEntity>,
  ): void {
    if (typeof attacker.damage !== 'number') {
      return;
    }
    if (typeof victim.health !== 'number') {
      return;
    }
    // Invulnerable ships (e.g. the neutral vendor) take no damage even though
    // they carry a health value.
    if (victim.invulnerable) {
      return;
    }
    if (damaged.has(victim)) {
      return;
    }

    // Rock is mined, not destroyed: a combat weapon chips ore off it slowly, so
    // asteroids (maxOre set) take a fraction of the damage a ship would. A mining
    // laser carries its own higher factor; other bullets use the global default.
    const factor = attacker.miningFactor ?? MINING_DAMAGE_FACTOR;
    const damage =
      victim.maxOre !== undefined ? attacker.damage * factor : attacker.damage;
    victim.health -= damage;
    damaged.add(victim);

    // Remember where this shot landed so mining breaks the next chunk off the
    // face being shot (only asteroids carry lastImpact).
    victim.lastImpact?.copy(attacker.transform.position);
  }
}
