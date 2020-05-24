import {System, Not, Entity} from 'ecsy';
import {WebGLRenderer} from 'three';

import {WebGlRenderer}  from '../components/webgl-renderer';
import {WebGlRendererContext} from '../components/webgl-renderer-context';
import {RenderPass} from '../components/render-pass';
import {Camera} from '../components/camera';
import {Scene} from '../components/scene';
import {Object3d} from '../components/object3d';

export class WebGlRendererSystem extends System {
  static queries: any = {
    renderersUninitialized: {
      components: [WebGlRenderer, Not(WebGlRendererContext)]
    },
    renderers: {
      components: [WebGlRenderer, WebGlRendererContext],
      listen: {
        changed: [WebGlRenderer]
      }
    },
    renderPasses: {
      components: [RenderPass]
    },
    cameras: {
      components: [Camera]
    },
    object3ds: {
      components: [Object3d],
      listen: {
        added: true
      }
    },
    scene: {
      components: [Scene]
    }
  };

  init() {
    window.addEventListener('resize', () => {
      this.queries.renderers.results.forEach(entity => {
        const component = entity.getMutableComponent(WebGlRenderer);

        if (component.handleResize) {
          component.width = window.innerWidth;
          component.height = window.innerHeight;
        }
      });
    });
  }

  execute() {
    this.queries.renderersUninitialized.results.forEach((renderer: Entity) => {
      const component = renderer.getComponent(WebGlRenderer);
      const webGlRenderer = new WebGLRenderer();

      webGlRenderer.setPixelRatio(window.devicePixelRatio);
      webGlRenderer.setSize(component.width, component.height);
      webGlRenderer.shadowMap.enabled = component.shadowMap;

      document.body.appendChild(webGlRenderer.domElement);

      renderer.addComponent(WebGlRendererContext, {value: webGlRenderer});
    });

    this.queries.renderers.results.forEach((rendererEntity: Entity) => {
      const renderer = rendererEntity.getComponent(WebGlRendererContext).value;

      this.queries.renderPasses.results.forEach((renderPassEntity: Entity) => {
        const renderPass = renderPassEntity.getComponent(RenderPass);
        const scene = renderPass.scene.getComponent(Scene).value;

        this.queries.cameras.results.forEach((cameraEntity: Entity) => {
          const camera3d = cameraEntity.getComponent(Object3d).value;

          renderer.render(scene, camera3d);
        });
      });
    });

    this.queries.object3ds.added.forEach((object3dEntity: Entity) => {
      const scene = this.queries.scene.results[0].getMutableComponent(Scene).value;
      const object3d = object3dEntity.getComponent(Object3d).value;

      scene.add(object3d);
    });
  }
}
