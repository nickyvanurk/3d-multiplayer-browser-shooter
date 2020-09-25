import { World } from 'ecsy';
import { 
  PerspectiveCamera,
  Scene, 
  WebGLRenderer as WebGlRenderer$1,
  BoxGeometry,
  MeshBasicMaterial,
  Mesh
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import { Connection } from '../../shared/components/connection';
import { Object3d } from './components/object3d';
import { WebGlRenderer } from './components/webgl-renderer';
import { WebGlRendererSystem } from './systems/webgl-renderer-system';
import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from '../../shared/systems/network-message-system';

export default class Game {
  constructor() {
    this.lastTime = performance.now();

    this.world = new World()
      .registerComponent(Object3d)
      .registerComponent(WebGlRenderer)
      .registerComponent(Connection)
      .registerSystem(WebGlRendererSystem)
      .registerSystem(NetworkEventSystem)
      .registerSystem(NetworkMessageSystem);

    const renderer = new WebGlRenderer$1({ antialias: true });
    renderer.setClearColor(0x020207);

    document.body.appendChild(renderer.domElement);

    const scene = new Scene();
    const sceneEntity = this.world
      .createEntity()
      .addComponent(Object3d, { value: scene });

    const camera = new PerspectiveCamera(
      99,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const cameraEntity = this.world
      .createEntity()
      .addComponent(Object3d, { value: camera });

    scene.add(camera);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(undefined, 1.0, 0.5, 0));

    this.world
      .createEntity()
      .addComponent(WebGlRenderer, {
        scene: sceneEntity,
        camera: cameraEntity,
        renderer: renderer,
        composer: composer
      });

    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial({ color: 0x00ff00 });
    this.cube = new Mesh( geometry, material );
    scene.add( this.cube );

    camera.position.z = 5;

    this.init();
  }

  init() {
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.world.execute(delta, time);

    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.01;

    this.lastTime = time;

    requestAnimationFrame(this.run.bind(this));
  }

  handleConnect(connection) {
    this.world
      .createEntity()
      .addComponent(Connection, { value: connection });
  }
}
