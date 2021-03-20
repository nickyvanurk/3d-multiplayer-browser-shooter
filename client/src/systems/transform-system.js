import { System } from 'ecsy';

import { Transform } from '../components/transform';
import { Transform2D } from '../components/transform2d';

export class TransformSystem extends System {
  static queries = {
    objects: {
      components: [Transform],
      listen: { changed: true }
    },
    objects2D: {
      components: [Transform2D],
      listen: { changed: true }
    }
  };

  init() {
    this.stop();
  }

  execute() {
    this.queries.objects.changed.forEach((entity) => {
      if (!entity.alive) return;
      const component = entity.getMutableComponent(Transform);
      component.prevPosition.copy(component.position);
      component.prevRotation.copy(component.rotation);
    });

    this.queries.objects2D.changed.forEach((entity) => {
      if (!entity.alive) return;
      const component = entity.getMutableComponent(Transform);
      component.prevPosition.copy(component.position);
      component.prevRotation = component.rotation;
    });
  }
}
