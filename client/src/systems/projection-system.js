import { System } from 'ecsy';

import { Vector3 } from 'three';

import { Transform } from '../components/transform';
import { Camera } from '../components/camera';
import { ScreenPosition } from '../components/screen-position';

export class ProjectionSystem extends System {
  static queries = {
    cameras: {
      components: [Camera, Transform]
    },
    entities: {
      components: [Transform, ScreenPosition]
    }
  };

  init() {
    this.point = new Vector3();
  }

  execute() {
    this.queries.entities.results.forEach((entity) => {
      let camera = this.tryGetCamera();

      if (!camera) {
        console.error('No camera found');
        return;
      }

      camera = camera.getComponent(Camera).value;
      const { position } = entity.getComponent(Transform);

      if (this.isPointBehindCamera(camera, position)) return;

      const projection = position.clone().project(camera);
      const screenPosition = entity.getMutableComponent(ScreenPosition);

      screenPosition.x = projection.x * window.innerWidth / 2;
      screenPosition.y = projection.y * window.innerHeight / 2;
    });
  }

  isPointBehindCamera(camera, position) {
    this.point.copy(position);
    this.point.applyMatrix4(camera.matrixWorldInverse);
    return this.point.z > 0;
  }

  tryGetCamera() {
    const cameras = this.queries.cameras.results;
    return cameras.length ? cameras[0] : false;
  }
}
