
import { System } from 'ecsy';
import { Raycaster as Raycaster$1, ArrowHelper, Vector3, Matrix4 } from 'three';

import { Camera } from '../components/camera';
import { Transform } from '../components/transform';
import { Object3d } from '../components/object3d';
import { Raycaster } from '../components/raycaster';
import { InputState } from '../components/input-state';
import { PlayerController } from '../components/player-controller';

export class RaycasterSystem extends System {
  static queries = {
    cameraWithRaycaster: {
      components: [Camera, Raycaster],
      listen: { added: true }
    },
    inputState: {
      components: [InputState]
    },
    mainPlayer: {
      components: [PlayerController]
    }
  };

  init() {
    this.arrowHelper = this.world
      .createEntity()
      .addComponent(Transform)
      .addComponent(Object3d, { value: new ArrowHelper(
        new Vector3(1, 0, 0),
        new Vector3(),
        1000,
        0xffff00
      ) });
  }

  execute() {
    this.queries.cameraWithRaycaster.added.forEach((entity) => {
      const raycaster = new Raycaster$1();
      raycaster.far = 1000;
      entity.getMutableComponent(Raycaster).value = raycaster;
    });

    this.queries.cameraWithRaycaster.results.forEach((entity) => {
      const raycaster = entity.getComponent(Raycaster).value;
      const object3d = entity.getComponent(Object3d).value;

      const inputStateEntity = this.queries.inputState.results[0];

      if (inputStateEntity) {
        const inputState = inputStateEntity.getComponent(InputState);
        const cameraTransform = entity.getComponent(Transform);

        const dir = new Vector3(inputState.mousePosition.x, inputState.mousePosition.y, 0.5)
          .applyMatrix4(object3d.projectionMatrixInverse)
          .applyMatrix4(new Matrix4().compose(cameraTransform.position, cameraTransform.rotation, new Vector3(1, 1, 1)))
          .sub(cameraTransform.position).normalize();
        raycaster.set(cameraTransform.position, dir);

        const mainPlayerEntity = this.queries.mainPlayer.results[0];
        
        if (mainPlayerEntity) {
          const transform =  this.arrowHelper.getMutableComponent(Transform);
          const arrowHelper = this.arrowHelper.getComponent(Object3d).value;

          transform.position.copy(mainPlayerEntity.getComponent(Transform).position);
          arrowHelper.setDirection(raycaster.ray.direction);
          transform.rotation.copy(arrowHelper.quaternion);
        }
      }
    });
  }
}
