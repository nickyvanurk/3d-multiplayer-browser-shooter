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
    this.queries.collisions.added.forEach((entity) => {
      entity.removeComponent(Collision);
    });

    this.queries.damageableCollisions.added.forEach((entity) => {
      const damage = entity.getComponent(Damage).value;
      entity.addComponent(SufferDamage, { amount: damage });
    });

    this.queries.destroyableCollisions.added.forEach((entity) => {
      entity.remove();
    });
  }
}
