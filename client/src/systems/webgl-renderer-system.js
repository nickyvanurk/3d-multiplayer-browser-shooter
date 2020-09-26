import { System } from 'ecsy';

import { WebGlRenderer } from '../components/webgl-renderer';
import { Object3d } from '../components/object3d';

export class WebGlRendererSystem extends System {
  static queries = {
    renderers: {
      components: [WebGlRenderer]
    },
    object3ds: {
      components: [Object3d],
      listen: {
        added: true,
        removed: true
      }
    }
  };

  init() {
    this.needsResize = true;
    window.onresize = this.onResize.bind(this);
  }

  execute() {
    this.queries.object3ds.added.forEach((entity) => {
      const object3d = entity.getComponent(Object3d).value;

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
