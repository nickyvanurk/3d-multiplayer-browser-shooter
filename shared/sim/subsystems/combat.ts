import { RESPAWN_DELAY } from '../entities/ship.ts';
import type { Entity } from '../entity.ts';

// The combat-relevant view of an entity: base Entity plus the optional
// lifecycle/weapon fields the subsystem duck-types on (present on Ship/Bullet).
interface CombatEntity extends Entity {
  health?: number;
  damage?: number;
  destroyOnCollision?: boolean;
  respawn?: boolean;
  respawnTimer?: number;
  owner?: Entity | null;
  invulnerable?: boolean;
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
        entity.respawnTimer = RESPAWN_DELAY;
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

    victim.health -= attacker.damage;
    damaged.add(victim);
  }
}
