import {System, Not, Entity} from 'ecsy';
import {WebGLRenderer, Vector2, CompressedPixelFormat} from 'three';

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
    this.queries.renderersUninitialized.results.forEach((rendererEntity: Entity) => {
      const component = rendererEntity.getComponent(WebGlRenderer);

      const renderer = new WebGLRenderer();
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(component.width, component.height);
      renderer.shadowMap.enabled = component.shadowMap;

      document.body.appendChild(renderer.domElement);

      rendererEntity.addComponent(WebGlRendererContext, {value: renderer});
    });

    this.queries.renderers.results.forEach((rendererEntity: Entity) => {
      const renderer = rendererEntity.getComponent(WebGlRendererContext).value;

      this.queries.renderPasses.results.forEach((renderPassEntity: Entity) => {
        const renderPass = renderPassEntity.getComponent(RenderPass);

        this.queries.cameras.results.forEach((cameraEntity: Entity) => {
          const camera3d = cameraEntity.getComponent(Object3d).value;

          renderer.render(renderPass.scene, camera3d);
        });
      });
    });

    this.queries.renderers.changed.forEach((rendererEntity: Entity) => {
      const component = rendererEntity.getComponent(WebGlRenderer);
      const renderer = rendererEntity.getComponent(WebGlRendererContext).value;

      const renderSize = new Vector2();
      renderer.getSize(renderSize);

      if (renderSize.width !== component.width ||
          renderSize.height !== component.height) {
        renderer .setSize(component.width, component.height);
      }
    });

    this.queries.object3ds.added.forEach((object3dEntity: Entity) => {
      const scene = this.queries.scene.results[0].getMutableComponent(Scene).value;
      const object3d = object3dEntity.getComponent(Object3d).value;

      scene.add(object3d);
    });
  }
}
