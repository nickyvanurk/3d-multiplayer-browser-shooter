import type { Entity } from '../entity.ts';

// The respawn-relevant view of an entity: base Entity plus the optional
// lifecycle fields the subsystem duck-types on (present on Ship).
interface RespawnEntity extends Entity {
  health?: number;
  respawnTimer?: number;
}

interface RespawnWorld {
  entities: Map<number, RespawnEntity>;
}

export class RespawnSubsystem {
  update(world: RespawnWorld, dt: number, _time?: number): void {
    for (const entity of world.entities.values()) {
      if (entity.alive === false) {
        entity.respawnTimer! -= dt;
        if (entity.respawnTimer! <= 0) {
          entity.alive = true;
          entity.health = 100;
          entity.velocity.set(0, 0, 0);
          entity.angularVelocity.set(0, 0, 0);
        }
      }
    }
  }
}
