import type { Vector3 } from 'three';
import { RESPAWN_DELAY } from '../entities/ship.ts';
import { ASTEROID_RESPAWN_DELAY, MINING_DAMAGE_FACTOR } from '../mining.ts';
import type { Entity } from '../entity.ts';

// The combat-relevant view of an entity: base Entity plus the optional
// lifecycle/weapon fields the subsystem duck-types on (present on Ship/Bullet).
export interface CombatEntity extends Entity {
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
  // Progression: the ship whose shot last damaged this one (the killer credited on
  // death) and this ship's own level (the XP a kill of it is worth). Present on
  // Ship; absent on rock/bullets.
  lastHitBy?: CombatEntity | null;
  level?: number;
  // Present on asteroids: stamped with the impact point so mining drops ore where
  // the shot landed. sweepProjectiles moves the bullet onto its exact hit point
  // before recording the collision, so the attacker's position IS that point.
  lastImpact?: Vector3;
}

interface CombatWorld {
  physics: { drainCollisions(): { a: CombatEntity; b: CombatEntity }[] };
  entities: Map<number, CombatEntity>;
}

// A ship destroyed this tick and who to credit for it. victimLevel is captured
// here (at death) because the victim resets to level 1 next tick on respawn.
export interface KillEvent {
  killerId: number | null;
  victimId: number;
  victimLevel: number;
}

export class CombatSubsystem {
  private kills: KillEvent[] = [];

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

        // A ship (not a mined-out asteroid) just died: report the kill so the
        // server can award XP to whoever last hit it. Ships take no bump damage,
        // so a death always came from a bullet that stamped lastHitBy.
        if (entity.maxOre === undefined) {
          this.kills.push({
            killerId: entity.lastHitBy?.id ?? null,
            victimId: entity.id!,
            victimLevel: entity.level ?? 1,
          });
          entity.lastHitBy = null;
        }
      } else {
        entity.markDestroyed();
      }
    }
  }

  // Drain the kills recorded this tick so the server can award XP from them,
  // clearing them for the next tick.
  drainKills(): KillEvent[] {
    const out = this.kills;
    this.kills = [];
    return out;
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

    // Credit the firing SHIP (the bullet's owner), not the bullet, for the kill.
    applyDamage(
      victim,
      attacker.damage,
      attacker.miningFactor,
      attacker.transform.position,
      attacker.owner ?? null,
    );
    damaged.add(victim);
  }
}

// Apply one hit's worth of damage to a victim. Shared by the collision path (bot
// bullets, via dealDamage) and the server's client-reported Hit path (players).
// Rock (maxOre) is mined at the reduced factor; ships take raw damage. `impact`
// stamps the asteroid so mining drops ore where the shot landed; `attacker` is the
// ship credited if this kills a ship (progression's lastHitBy).
export function applyDamage(
  victim: CombatEntity,
  damage: number,
  miningFactor: number | undefined,
  impact?: Vector3,
  attacker?: CombatEntity | null,
): void {
  if (typeof victim.health !== 'number') {
    return;
  }
  // Invulnerable ships (e.g. the neutral vendor) take no damage.
  if (victim.invulnerable) {
    return;
  }

  const factor = miningFactor ?? MINING_DAMAGE_FACTOR;
  const dealt = victim.maxOre !== undefined ? damage * factor : damage;
  victim.health -= dealt;

  // Remember where the shot landed so mining breaks the next chunk off the face
  // being shot (only asteroids carry lastImpact).
  if (impact) {
    victim.lastImpact?.copy(impact);
  }
  // Only ships (not rock) carry lastHitBy; credit the attacking ship for a kill.
  if (attacker && victim.maxOre === undefined) {
    victim.lastHitBy = attacker;
  }
}
