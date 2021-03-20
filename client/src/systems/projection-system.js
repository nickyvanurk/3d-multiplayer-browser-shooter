import { System } from 'ecsy';

import { Object3D } from 'three';

import { Transform } from '../components/transform';
import { Transform2D } from '../components/transform2d';
import { Camera } from '../components/camera';

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

      const transform2d = entity.getMutableComponent(Transform2D);
      transform2d.x = projection.x * window.innerWidth / 2;
      transform2d.y = projection.y * window.innerHeight / 2;


      console.log(transform2d.x);

      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.position.copy(transform.position);
      this.dummy.applyMatrix4(camera.matrixWorldInverse);
      const localPosition = this.dummy.position;
      transform2d.rotation = Math.atan2(localPosition.y, localPosition.x);
    });
  }

  tryGetCamera() {
    const cameras = this.queries.cameras.results;
    return cameras.length ? cameras[0] : false;
  }
}
