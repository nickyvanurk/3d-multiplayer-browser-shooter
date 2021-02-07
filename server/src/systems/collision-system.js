import { System } from 'ecsy';

import Types from '../../../shared/types';
import { Collision } from '../components/collision';
import { Kind } from '../../../shared/components/kind';
import { Destroy } from '../components/destroy';

export class CollisionSystem extends System {
  static queries = {
    collisions: {
      components: [Collision]
    }
  };

  execute(_delta, _time) {
    this.queries.collisions.results.forEach((entity) => {
      if (!entity.alive) return;

      const kind = entity.getComponent(Kind).value;

      entity.removeComponent(Collision);

      if (kind === Types.Entities.BULLET) {
        entity.addComponent(Destroy);
      }
    });
  }
}
