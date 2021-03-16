import { System } from 'ecsy';

import { Transform } from '../components/transform';

export class TransformSystem extends System {
  static queries = {
    objects: {
      components: [Transform],
      listen: { changed: true }
    }
  };

  init() {
    this.stop();
  }

  execute() {
    this.queries.objects.changed.forEach((entity) => {
      if (!entity.alive) {
        return;
      }

      const component = entity.getComponent(Transform);
      component.prevPosition.copy(component.position);
      component.prevRotation.copy(component.rotation);
    });
  }
}
