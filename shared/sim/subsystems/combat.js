import { RESPAWN_DELAY } from '../entities/ship.js';

export class CombatSubsystem {
  update(world) {
    const pairs = world.physics.drainCollisions();

    const damaged = new Set();
    for (const { a, b } of pairs) {
      this.dealDamage(a, b, damaged);
      this.dealDamage(b, a, damaged);

      if (a.destroyOnCollision) {a.markDestroyed();}
      if (b.destroyOnCollision) {b.markDestroyed();}
    }

    for (const entity of world.entities.values()) {
      if (typeof entity.health !== 'number' || entity.health > 0) {continue;}

      if (entity.respawn === true) {
        if (!entity.alive) {continue;}
        entity.alive = false;
        entity.respawnTimer = RESPAWN_DELAY;
      } else {
        entity.markDestroyed();
      }
    }
  }

  dealDamage(attacker, victim, damaged) {
    if (typeof attacker.damage !== 'number') {return;}
    if (typeof victim.health !== 'number') {return;}
    if (damaged.has(victim)) {return;}

    victim.health -= attacker.damage;
    damaged.add(victim);
  }
}
