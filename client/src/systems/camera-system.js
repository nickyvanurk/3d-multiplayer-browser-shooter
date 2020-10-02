
import { System } from 'ecsy';
import { Object3D } from 'three';

import { Camera } from '../components/camera';
import { Transform } from '../components/transform';
import { PlayerController } from '../components/player-controller';

export class CameraSystem extends System {
  static queries = {
    camera: {
      components: [Camera, Transform]
    },
    mainPlayer: {
      components: [PlayerController]
    }
  };

  execute(delta) {
    const mainPlayerEntity = this.queries.mainPlayer.results[0];
    const cameraEntity = this.queries.camera.results[0];

    if (mainPlayerEntity && cameraEntity) {
      const mainPlayerTransform = mainPlayerEntity.getComponent(Transform);
      const cameraTransform = cameraEntity.getMutableComponent(Transform);

      const obj = new Object3D();
      obj.position.copy(mainPlayerTransform.position);
      obj.quaternion.copy(mainPlayerTransform.rotation);
      obj.translateY(1);
      obj.translateZ(4);

      cameraTransform.position.lerp(obj.position, 1 - Math.exp(-10 * (delta/1000)));
      cameraTransform.rotation.slerp(obj.quaternion, 1 - Math.exp(-10 * (delta/1000)));
    }
  }
}
