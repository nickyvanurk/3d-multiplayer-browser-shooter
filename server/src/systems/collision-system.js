import { System } from 'ecsy';

import { Collision } from '../components/collision';

export class CollisionSystem extends System {
  static queries = {
    collisions: {
      components: [Collision]
    }
  };

  execute(_delta, _time) {
    this.queries.collisions.results.forEach((entity) => {
      let collision = entity.getComponent(Collision);
      entity.removeComponent(Collision);
    });
  }
}
