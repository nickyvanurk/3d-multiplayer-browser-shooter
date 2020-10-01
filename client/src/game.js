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
import * as workerInterval from 'worker-interval';

import Utils from '../../shared/utils';
import Types from '../../shared/types';
import { WebGlRenderer } from './components/webgl-renderer';
import { Connection } from '../../shared/components/connection';
import { Object3d } from './components/object3d';
import { Transform } from './components/transform';
import { InputState } from './components/input-state';
import { PlayerInputState } from '../../shared/components/player-input-state';
import { PlayerController } from './components/player-controller';
import { WebGlRendererSystem } from './systems/webgl-renderer-system';
import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from './systems/network-message-system';
import { TransformSystem } from './systems/transform-system';
import { InputSystem } from './systems/input-system';
import { PlayerInputSystem } from './systems/player-input-system';

export default class Game {
  constructor() {
    this.lastTime = performance.now();
    this.updatesPerSecond = 60;

    this.world = new World()
      .registerComponent(WebGlRenderer)
      .registerComponent(Connection)
      .registerComponent(Object3d)
      .registerComponent(Transform)
      .registerComponent(InputState)
      .registerComponent(PlayerInputState)
      .registerComponent(PlayerController)
      .registerSystem(NetworkEventSystem, this)
      .registerSystem(InputSystem)
      .registerSystem(PlayerInputSystem)
      .registerSystem(TransformSystem)
      .registerSystem(WebGlRendererSystem)
      .registerSystem(NetworkMessageSystem);

    this.inputSystem = this.world.getSystem(InputSystem);
    this.updateSystems = this.world.getSystems().filter((system) => {
      return !(system instanceof InputSystem) &&
             !(system instanceof WebGlRendererSystem);
    });
    this.renderSystem = this.world.getSystem(WebGlRendererSystem);

    this.player = undefined;
    this.entities = [];

    const renderer = new WebGlRenderer$1({ antialias: true });
    renderer.setClearColor(0x020207);

    document.body.appendChild(renderer.domElement);

    const scene = new Scene();

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
        scene: scene,
        camera: cameraEntity,
        renderer: renderer,
        composer: composer
      });

    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial({ color: 0x767522 });
    this.cube = new Mesh( geometry, material );
    scene.add(this.cube);

    camera.position.z = 15;
  }

  init() {
    this.world.systemManager.executeSystem(this.inputSystem);

    this.fixedUpdate = Utils.createFixedTimestep(
      1000/this.updatesPerSecond,
      this.handleFixedUpdate.bind(this)
    ); 
    
    workerInterval.setInterval(this.update.bind(this), 1000/this.updatesPerSecond);
    requestAnimationFrame(this.render.bind(this));
  }

  update() {
    const time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }
    
    this.fixedUpdate(delta, time);
    this.lastTime = time;
  }

  render() {
    requestAnimationFrame(this.render.bind(this));
    this.world.systemManager.executeSystem(this.renderSystem);
    this.world.entityManager.processDeferredRemoval();
  }

  handleFixedUpdate(delta, time) {
    if (this.world.enabled) {
      this.updateSystems.forEach((system) => {
        if (system.enabled) {
          this.world.systemManager.executeSystem(system, delta, time);
        }
      });
    }

    this.world.entityManager.processDeferredRemoval();

    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.01;
  }

  handleConnect(connection) {
    this.player = this.world
      .createEntity()
      .addComponent(Connection, { value: connection });
  }

  addPlayer(id, position, rotation) {
    const cube = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ color: 0xf07167 })
    );

    this.entities[id] = this.player
      .addComponent(Object3d, { value: cube })
      .addComponent(Transform, { position, rotation })
      .addComponent(PlayerController, {
        forward: 'KeyE',
        backward: 'KeyD',
        rollLeft: 'KeyW',
        rollRight: 'KeyR',
        strafeLeft: 'KeyS',
        strafeRight: 'KeyF',
        strafeUp: 'Backspace',
        strafeDown: 'Delete',
        boost: 'ShiftLeft'
      });
  }

  addEntity(id, kind, position, rotation) {
    switch (kind) {
      case Types.Entities.CUBE: {
        const cube = new Mesh(
          new BoxGeometry(),
          new MeshBasicMaterial({ color: 0x767522 })
        );
      
        this.entities[id] = this.world
          .createEntity()
          .addComponent(Object3d, { value: cube })
          .addComponent(Transform, { position, rotation });
      }
    }
  }

  removeEntity(id) {
    this.entities[id].remove();
    delete this.entities[id];
  }
}
