import {System, Entity} from 'ecsy';

import {Destroy} from '../components/destroy';

export class DestroySystem extends System {
  static queries: any = {
    entities: {
      components: [Destroy],
      listen: {
        added: true
      }
    }
  };

  execute() {
    this.queries.entities.added.forEach((entity: Entity) => {
      entity.remove();
    });
  }
}
