import {System, Entity} from 'ecsy';

import {Destroy} from '../components/destroy';
import {CollisionStart} from '../components/collision-start';
import {DestroyOnCollision} from '../components/destroy-on-collision';

export class DestroySystem extends System {
  static queries: any = {
    entities: {
      components: [Destroy],
      listen: {
        added: true
      }
    },
    colliding: {
      components: [CollisionStart, DestroyOnCollision],
      listen: {
        added: true
      }
    }
  };

  execute() {
    this.queries.entities.added.forEach((entity: Entity) => {
      // @ts-ignore
      if (entity.alive) entity.remove();
    });

    this.queries.colliding.added.forEach((entity: Entity) => {
      // @ts-ignore
      if (entity.alive) entity.remove();
    });
  }
}
