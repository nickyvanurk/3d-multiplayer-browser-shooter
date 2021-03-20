import { System } from 'ecsy';
import { Vector3 } from 'three';

import { Input } from '../../../shared/components/input';
import { Camera } from '../components/camera';
import { Transform } from '../components/transform';
import { Transform2D } from '../components/transform2d';
import { Onscreen } from '../components/onscreen';

export class AimAssistSystem extends System {
  static queries = {
    inputs: {
      components: [Input]
    },
    cameras: {
      components: [Camera]
    },
    onscreenIndicators: {
      components: [Transform, Transform2D, Onscreen]
    }
  };

  init() {
    this.lastVel = new Vector3();
  }

  execute() {
    const camera = this.tryGetCamera();
    if (!camera) {
      console.error('Camera not found');
      return;
    }

    let input = this.tryGetInput();
    if (!input) {
      console.error('Input not found');
      return;
    }

    const { aim } = input.getComponent(Input);
    if (aim.distance !== aim.maxDistance) {
      const { aim } = input.getMutableComponent(Input);
      aim.distance = aim.maxDistance;
    }

    const mouseInPixels = {
      x: aim.mouse.x*(window.innerWidth/2),
      y: aim.mouse.x*(window.innerWidth/2)
    };
    const targetRadius = 100; // px

    this.queries.onscreenIndicators.results.forEach((entity) => {
      const { position } = entity.getComponent(Transform2D);
      const mp = {
        x: mouseInPixels.x - position.x,
        y: mouseInPixels.y - position.y
      };

      const distance = entity.getComponent(Transform).position.clone()
            .sub(camera.getComponent(Transform).position).length();
      const radius = Math.max(64, targetRadius*10/distance);

      if (mp.x*mp.x + mp.y*mp.y < radius*radius) {
        const { aim } = input.getMutableComponent(Input);
        aim.distance = entity.getComponent(Transform).position.clone()
            .sub(camera.getComponent(Transform).position).length();

      //  const cameraObj = camera.getComponent(Camera).value;
      //  const transform = entity.getComponent(Transform);
      //  const velocity = transform.position.clone().sub(transform.prevPosition);

      //  const bulletSpeed = 0.1;
      //  const target = transform.position.clone().add(velocity.multiplyScalar(distance/(bulletSpeed*16.66666666666)));
      //  const newDirection = target.sub(cameraObj.position).normalize();
      //  aim.direction = newDirection;
      }
    });
  }

  tryGetInput() {
    const input = this.queries.inputs.results;
    return input.length ? input[0] : false;
  }

  tryGetCamera() {
    const cameras = this.queries.cameras.results;
    return cameras.length ? cameras[0] : false;
  }
}
