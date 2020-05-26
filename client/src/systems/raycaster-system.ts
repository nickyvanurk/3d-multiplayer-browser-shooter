import {System, Entity} from 'ecsy';
import {Raycaster as Raycaster$1} from 'three';

import {Raycaster} from '../components/raycaster';
import {RaycasterReceiver} from '../components/raycast-receiver';
import {Object3d} from '../components/object3d';
import {InputState} from '../components/input-state';

export class RaycasterSystem extends System {
  static queries: any = {
    raycasters: {
      components: [Raycaster],
      listen: {
        added: true
      }
    },
    raycasterReceivers: {
      components: [RaycasterReceiver]
    },
    inputState: {
      components: [InputState]
    }
  };

  execute() {
    const raycasterQuery = this.queries.raycasters;
    const raycasterReceiversQuery = this.queries.raycasterReceivers;

    raycasterQuery.added.forEach((raycasterEntity: Entity) => {
      const raycaster = new Raycaster$1();
      raycaster.far = 200;
      raycasterEntity.getMutableComponent(Raycaster).value = raycaster;
    });

    const inputStateEntity = this.queries.inputState.results[0];

    raycasterQuery.results.forEach((raycasterEntity: Entity) => {
      const raycasterComponent = raycasterEntity.getMutableComponent(Raycaster);
      const raycaster = raycasterComponent.value;
      const camera3d = raycasterEntity.getComponent(Object3d).value;

      if (inputStateEntity) {
        const inputState = inputStateEntity.getComponent(InputState);
        raycaster.setFromCamera(inputState.mousePosition, camera3d);
      }

      const objects = raycasterReceiversQuery.results
        .map((entity: Entity) => {
          const object = entity.getComponent(Object3d).value;

          object.traverse((child: any) => {
            child.userData.entity = entity;
          });

          return object;
        });

      if (objects.length === 0) {
        return;
      }

      const intersections = raycaster.intersectObjects(objects, true);

      if (intersections.length > 0) {
        const intersection = intersections[0].object.parent
          ? intersections[0]
          : intersections[1];

        let object = intersection.object;
        let entity = object.userData.entity;

        raycasterComponent.currentEntity = entity;
        raycasterComponent.intersection = intersection;
      } else if (raycasterComponent.currentEntity) {
        raycasterComponent.currentEntity = null;
        raycasterComponent.intersection = null;
      }
    });
  }
}
