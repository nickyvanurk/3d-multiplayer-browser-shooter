import { System } from 'ecsy';
import { Euler } from 'three';

import { Transform } from '../../../shared/components/transform';
import { Object3d } from '../components/object3d';

export class TransformSystem extends System {
  static queries = {
    objects: {
      components: [Transform, Object3d],
      listen: {
        added: true,
        changed: [Transform]
      }
    }
  };

  init(game) {
    this.game = game;
  }

  execute() {
    this.queries.objects.added.forEach((entity) => {
      this.updateTransform(entity);
    });
      
    this.queries.objects.changed.forEach((entity) => {
      if (!entity.alive) {
        return;
      }

      this.updateTransform(entity);
    });
  }

  updateTransform(entity) {
    const component = entity.getComponent(Transform);
    const object3d = entity.getMutableComponent(Object3d).value;

    object3d.position.copy(component.position);
    object3d.quaternion.setFromEuler(new Euler(
      component.rotation.x,
      component.rotation.y,
      component.rotation.z
    ));
  }
}
