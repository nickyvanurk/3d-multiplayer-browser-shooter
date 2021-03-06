import { System } from 'ecsy';

import { Object3D } from 'three';

import { Transform } from '../components/transform';
import { Transform2D } from '../components/transform2d';
import { Camera } from '../components/camera';
import { Onscreen } from '../components/onscreen';

export class ProjectionSystem extends System {
  static queries = {
    cameras: {
      components: [Camera, Transform]
    },
    objects: {
      components: [Transform, Transform2D]
    }
  };

  init() {
    this.dummy = new Object3D();
  }

  execute() {
  }

  render() {
    this.queries.objects.results.forEach((entity) => {
      let camera = this.tryGetCamera();

      if (!camera) {
        console.error('No camera found');
        return;
      }

      camera = camera.getComponent(Camera).value;
      const transform = entity.getComponent(Transform);
      const projection = transform.position.clone().project(camera);

      const halfWidth = window.innerWidth / 2;
      const halfHeight = window.innerHeight / 2;

      const transform2d = entity.getMutableComponent(Transform2D);
      transform2d.position.x = projection.x * halfWidth;
      transform2d.position.y = projection.y * halfHeight;

      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.position.copy(transform.position);
      this.dummy.applyMatrix4(camera.matrixWorldInverse);
      const localPosition = this.dummy.position;
      transform2d.rotation = Math.atan2(localPosition.y, localPosition.x);

      if (localPosition.z > 0 ||
          Math.abs(transform2d.position.x) >= halfWidth ||
          Math.abs(transform2d.position.y) >= halfHeight) {
        if (entity.hasComponent(Onscreen)) {
          entity.removeComponent(Onscreen);
        }
      } else if (!entity.hasComponent(Onscreen)) {
        entity.addComponent(Onscreen);
      }
    });
  }

  tryGetCamera() {
    const cameras = this.queries.cameras.results;
    return cameras.length ? cameras[0] : false;
  }
}
