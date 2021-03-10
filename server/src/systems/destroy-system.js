import { System } from 'ecsy';

import { Destroy } from '../components/destroy';

export class DestroySystem extends System {
  static queries = {
    entities: {
      components: [Destroy]
    }
  };

  execute(_delta, _time) {
    this.queries.entities.results.forEach((entity) => {
      entity.remove();
    });
  }
}
