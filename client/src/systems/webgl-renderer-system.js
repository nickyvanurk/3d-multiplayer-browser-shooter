import { System } from 'ecsy';
import { Vector3, Quaternion } from 'three';

import { WebGlRenderer } from '../components/webgl-renderer';
import { Object3d } from '../components/object3d';
import { Transform } from '../components/transform';

export class WebGlRendererSystem extends System {
  static queries = {
    renderers: {
      components: [WebGlRenderer]
    },
    object3ds: {
      components: [Object3d, Transform],
      listen: {
        added: true,
        removed: true
      }
    }
  };

  init(game) {
    this.game = game;
    this.needsResize = true;
    window.onresize = this.onResize.bind(this);
  }

  execute() {
    this.queries.object3ds.added.forEach((entity) => {
      if (!entity.alive) {
        return;
      }

      const object3d = entity.getComponent(Object3d).value;
      const transform = entity.getComponent(Transform);

      object3d.scale.copy(new Vector3().setScalar(transform.scale));

      this.queries.renderers.results.forEach((rendererEntity) => {
        const scene = rendererEntity.getComponent(WebGlRenderer).scene;
        scene.add(object3d);
      });
    });

    this.queries.object3ds.removed.forEach((entity) => {
      const object3d = entity.getRemovedComponent(Object3d).value;

      this.queries.renderers.results.forEach((rendererEntity) => {
        const scene = rendererEntity.getComponent(WebGlRenderer).scene;
        scene.remove(object3d);
      });
    });

    this.queries.object3ds.results.forEach((entity) => {
      const transform = entity.getComponent(Transform);
      const object3d = entity.getMutableComponent(Object3d).value;



      const renderPosition = new Vector3()
        .copy(transform.position)
        .multiplyScalar(this.game.alpha)
        .add(new Vector3().copy(transform.prevPosition).multiplyScalar(1 - this.game.alpha));
      const renderRotation = new Quaternion()
        .copy(transform.prevRotation)
        .slerp(transform.rotation, this.game.alpha);

      object3d.position.copy(renderPosition);
      object3d.quaternion.copy(renderRotation);
    });

    this.queries.renderers.results.forEach((entity) => {
      const component = entity.getComponent(WebGlRenderer);
      const camera = component.camera.getComponent(Object3d).value;
      const scene = component.scene;
      const renderer = component.renderer;
      const composer = component.composer;
      
      if (this.needsResize) {
        const currentPixelRatio = renderer.getPixelRatio();

        if (currentPixelRatio !== window.devicePixelRatio) {
          renderer.setPixelRatio(window.devicePixelRatio);
        }

        const canvas = renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        composer.setSize(width, height);

        this.needsResize = false;
      }

      composer.render(scene, camera);
    });
  }

  onResize() {
    this.needsResize = true;
  }
}
