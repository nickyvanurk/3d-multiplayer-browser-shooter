import { System } from 'ecsy';

import { Collision } from '../components/collision';
import { Damage } from '../components/damage';
import { SufferDamage } from '../components/suffer-damage';
import { DestroyOnCollision } from '../components/destroy-on-collision';

export class CollisionSystem extends System {
  static queries = {
    collisions: {
      components: [Collision],
      listen: { added: true }
    },
    damageableCollisions: {
      components: [Collision, Damage],
      listen: { added: true }
    },
    destroyableCollisions: {
      components: [Collision, DestroyOnCollision],
      listen: { added: true }
    }
  };

  execute(_delta, _time) {
    this.queries.damageableCollisions.added.forEach((entity) => {
      const damage = entity.getComponent(Damage).value;
      entity.getComponent(Collision).collidingWith.forEach((other) => {
        // TODO: make damage stackable (example: hit by 2 projectiles at same time)
        if (!other.hasComponent(SufferDamage)) {
          other.addComponent(SufferDamage, { amount: damage });
        }
      });
    });

    this.queries.collisions.added.forEach((entity) => {
      entity.removeComponent(Collision);
    });

    this.queries.destroyableCollisions.added.forEach((entity) => {
      if (entity.alive) {
        entity.remove();
      }
    });
  }
}
