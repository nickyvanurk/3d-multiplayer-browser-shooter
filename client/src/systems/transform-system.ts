import {System, Entity} from 'ecsy';

import {Transform} from '../components/transform';
import {Object3d} from '../components/object3d';

export class TransformSystem extends System {
  static queries: any = {
    transforms: {
      components: [Transform, Object3d],
      listen: {
        added: true,
        changed: [Transform]
      }
    }
  };

  execute() {
    this.queries.transforms.added.forEach((transformEntity: Entity) => {
      const transform = transformEntity.getComponent(Transform);
      const object3d = transformEntity.getComponent(Object3d).value;

      object3d.position.copy(transform.position);
      object3d.quaternion.copy(transform.rotation);
    });

    this.queries.transforms.changed.forEach((transformEntity: Entity) => {
      const transform = transformEntity.getComponent(Transform);
      const object3d = transformEntity.getComponent(Object3d).value;

      object3d.position.copy(transform.position);
      object3d.quaternion.copy(transform.rotation);
    });
  }
}
