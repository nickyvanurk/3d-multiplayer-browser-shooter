import { System, Not, Entity } from 'ecsy';
import { PerspectiveCamera } from 'three';

import { Camera } from '../components/camera';
import { Object3d } from '../components/object3d';

export class CameraSystem extends System {
  static queries: any = {
    camerasUninitialized: {
      components: [Camera, Not(Object3d)]
    },
    cameras: {
      components: [Camera, Object3d],
      listen: {
        changed: [Camera]
      }
    }
  };

  init() {
    window.addEventListener('resize', () => {
      this.queries.cameras.results.forEach((camera: Entity) => {
        const component = camera.getMutableComponent(Camera);

        if (component.handleResize) {
          component.aspect = window.innerWidth / window.innerHeight;
        }
      });
    });
  }

  execute() {
    this.queries.camerasUninitialized.results.forEach((camera: Entity) => {
      const component = camera.getComponent(Camera);

      const perspectiveCamera = new PerspectiveCamera(
        component.fov,
        component.aspect,
        component.near,
        component.far
      );

      perspectiveCamera.layers.enable(component.layer);

      camera.addComponent(Object3d, {value: perspectiveCamera});
    });

    this.queries.cameras.changed.forEach((camera: Entity) => {
      const component = camera.getComponent(Camera);
      const camera3d = camera.getMutableComponent(Object3d).value;

      if (camera3d.fov !== component.fov) {
        camera3d.fov = component.fov;
        camera3d.updateProjectionMatrix();
      }

      if (camera3d.aspect !== component.aspect) {
        camera3d.aspect = component.aspect;
        camera3d.updateProjectionMatrix();
      }

      if (camera3d.near !== component.near) {
        camera3d.near = component.near;
        camera3d.updateProjectionMatrix();
      }

      if (camera3d.far !== component.far) {
        camera3d.far = component.far;
        camera3d.updateProjectionMatrix();
      }
    });
  }
}
