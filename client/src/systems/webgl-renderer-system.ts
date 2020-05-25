import {System, Not, Entity} from 'ecsy';
import {WebGLRenderer, Vector2} from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass as RenderPass$1} from 'three/examples/jsm/postprocessing/RenderPass' ;
import {UnrealBloomPass as UnrealBloomPass$1} from 'three/examples/jsm/postprocessing/UnrealBloomPass' ;

import {WebGlRenderer}  from '../components/webgl-renderer';
import {WebGlRendererContext} from '../components/webgl-renderer-context';
import {RenderPass} from '../components/render-pass';
import {UnrealBloomPass} from '../components/unreal-bloom-pass';
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
    scene: {
      components: [Scene]
    },
    renderPasses: {
      components: [RenderPass],
      listen: {
        added: true
      }
    },
    unrealBloomPasses: {
      components: [UnrealBloomPass],
      listen: {
        added: true
      }
    },
    cameras: {
      components: [Camera]
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

      const renderer = new WebGLRenderer({antialias: component.antialias});
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(component.width, component.height);
      renderer.setClearColor(component.clearColor);
      renderer.shadowMap.enabled = component.shadowMap;

      document.body.appendChild(renderer.domElement);

      const composer = new EffectComposer(renderer);
      composer.setSize(component.width, component.height);

      rendererEntity.addComponent(WebGlRendererContext, {renderer, composer});
    });

    this.queries.renderers.results.forEach((rendererEntity: Entity) => {
      rendererEntity.getComponent(WebGlRendererContext).composer.render();
    });

    this.queries.renderers.changed.forEach((rendererEntity: Entity) => {
      const component = rendererEntity.getComponent(WebGlRenderer);
      const renderer = rendererEntity.getComponent(WebGlRendererContext).renderer;

      const renderSize = new Vector2();
      renderer.getSize(renderSize);

      if (renderSize.width !== component.width ||
          renderSize.height !== component.height) {
        renderer.setSize(component.width, component.height);

        const composer = rendererEntity.getComponent(WebGlRendererContext).composer;
        composer.setSize(component.width, component.height);
      }
    });

    this.queries.renderPasses.added.forEach((renderPassEntity: Entity) => {
      const scene = this.queries.scene.results[0].getMutableComponent(Scene).value;

      this.queries.renderers.results.forEach((rendererEntity: Entity) => {
        const composer = rendererEntity.getComponent(WebGlRendererContext).composer;

        this.queries.cameras.results.forEach((cameraEntity: Entity) => {
          const camera3d = cameraEntity.getComponent(Object3d).value;
          const renderedScene = new RenderPass$1(scene, camera3d);

          composer.addPass(renderedScene);
        });
      });
    });

    this.queries.unrealBloomPasses.added.forEach((unrealBloomPassEntity: Entity) => {
      const component = unrealBloomPassEntity.getComponent(UnrealBloomPass);

      this.queries.renderers.results.forEach((rendererEntity: Entity) => {
        const renderer = rendererEntity.getComponent(WebGlRendererContext).renderer;
        const composer = rendererEntity.getComponent(WebGlRendererContext).composer;

        const renderSize = new Vector2();
        renderer.getSize(renderSize);

        const bloomPass = new UnrealBloomPass$1(
          new Vector2(renderSize.width, renderSize.height),
          component.strength,
          component.radius,
          component.threshold
        );
        composer.addPass(bloomPass);
      });
    });

    this.queries.object3ds.added.forEach((object3dEntity: Entity) => {
      const scene = this.queries.scene.results[0].getMutableComponent(Scene).value;
      const object3d = object3dEntity.getComponent(Object3d).value;

      scene.add(object3d);
    });

    this.queries.object3ds.removed.forEach((object3dEntity: Entity) => {
      const scene = this.queries.scene.results[0].getMutableComponent(Scene).value;
      const object3d = object3dEntity.getRemovedComponent(Object3d).value;

      scene.remove(object3d);
    });
  }
}
