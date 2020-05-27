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



    // for (let i = this.queries.colliding.added.length - 1; i >= 0; --i) {
    //   this.queries.colliding.added[i].remove();
    // }

    // for (let i = this.queries.entities.added.length - 1; i >= 0; --i) {
    //   // @ts-ignore
    //   if (this.queries.entities.added[i].alive)
    //     this.queries.entities.added[i].remove();
    // }

    // if (this.queries.entities.added.length) {
    //   console.log(this.queries.entities.added);
    // }


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
