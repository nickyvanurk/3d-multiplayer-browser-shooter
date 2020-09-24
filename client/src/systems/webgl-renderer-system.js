import { System } from 'ecsy';

import { WebGlRenderer } from '../components/webgl-renderer';
import { Object3d } from '../components/object3d';

export class WebGlRendererSystem extends System {
  static queries = {
    renderers: {
      components: [WebGlRenderer]
    }
  };

  init() {
    this.needsResize = true;
    window.onresize = this.onResize.bind(this);
  }

  execute() {
    this.queries.renderers.results.forEach((entity) => {
      const component = entity.getComponent(WebGlRenderer);
      const camera = component.camera.getComponent(Object3d).value;
      const scene = component.scene.getComponent(Object3d).value;
      const renderer = component.renderer;
      
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

        this.needsResize = false;
      }

      renderer.render(scene, camera);
    });
  }

  onResize() {
    this.needsResize = true;
  }
}
