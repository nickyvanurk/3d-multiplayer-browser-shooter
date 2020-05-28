

import {System, Entity} from 'ecsy';
import {Camera} from 'three';

import {Screenshake} from '../components/screenshake';
import {Object3d} from '../components/object3d';
import {Transform}  from '../components/transform';
import {Destroy} from '../components/destroy';

export class ScreenshakeSystem extends System {
  static queries: any = {
    screenshakes: {
      components: [Screenshake],
      listen: {
        added: true
      }
    },
    camera: {
      components: [Object3d, Camera]
    },
  };

  execute() {
    this.queries.screenshakes.results.forEach((entity: Entity) => {
      if (entity.getComponent(Screenshake).strength > 0) {
        this.queries.camera.results.forEach((camera: Entity) => {
          const object3d = camera.getComponent(Object3d).value;
          const screenShakeComponent = entity.getMutableComponent(Screenshake);

          let strength = screenShakeComponent.strength;
          let damping = screenShakeComponent.damping;

          if (screenShakeComponent.distance && entity.hasComponent(Transform)) {
            const entityPosition = entity.getComponent(Transform).position;
            const screenshakeDistance = screenShakeComponent.distance;
            const cameraDistance = entityPosition.distanceTo(object3d.position);

            if (cameraDistance <= screenshakeDistance) {
              const distanceRatio = 1 - cameraDistance / screenshakeDistance;

              strength *= distanceRatio;
              damping *= distanceRatio;
            }
          }

          object3d.translateX(Math.random() * 2 * strength - strength);
          object3d.translateY(Math.random() * 2 * strength - strength);

          screenShakeComponent.strength -= screenShakeComponent.damping;
        });
      } else {
        entity.addComponent(Destroy);
      }
    });
  }
}
