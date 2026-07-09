import type { Vector3, Quaternion } from 'three';
import type { Entity } from '../entity.ts';
import type { PhysicsWorld } from '../world.ts';
import { pickSpawnPosition } from '../spawn.ts';

// The respawn-relevant view of an entity: base Entity plus the optional
// lifecycle fields the subsystem duck-types on (present on Ship).
interface RespawnEntity extends Entity {
  health?: number;
  respawnTimer?: number;
}

// The bit of the physics stepper respawn needs on top of the base contract:
// teleport a body to its new spawn pose. Optional so headless sim tests (which
// run without a real stepper) still exercise the reposition.
interface RespawnPhysics extends PhysicsWorld {
  correctBody?(
    entity: Entity,
    position: Vector3,
    rotation: Quaternion,
    velocity: Vector3,
    angularVelocity: Vector3,
  ): void;
}

interface RespawnWorld {
  entities: Map<number, RespawnEntity>;
  physics?: RespawnPhysics;
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

          // Come back somewhere fresh (clear of asteroids, away from other ships)
          // instead of at the death spot. A self-simulated bot's body must be
          // teleported too, or the stepper drags it back to where it died next
          // tick; a human's client re-adopts the new pose from the Spawn the
          // server broadcasts on the dead->alive transition.
          const position = pickSpawnPosition(world, Math.random, entity);
          entity.transform.position.copy(position);
          world.physics?.correctBody?.(
            entity,
            position,
            entity.transform.rotation,
            entity.velocity,
            entity.angularVelocity,
          );
        }
      }
    }
  }
}
