import { World } from 'ecsy';
import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer as WebGlRenderer$1,
  LoadingManager,
  AmbientLight,
  DirectionalLight,
  Fog,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Points,
  BoxGeometry,
  MeshBasicMaterial,
  Mesh
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import * as workerInterval from 'worker-interval';

import { AssetManager } from '../../shared/asset-manager';

import Utils from '../../shared/utils';
import Types from '../../shared/types';
import { WebGlRenderer } from './components/webgl-renderer';
import { Connection } from '../../shared/components/connection';
import { Object3d } from './components/object3d';
import { Transform } from './components/transform';
import { Keybindings } from './components/keybindings';
import { Input } from '../../shared/components/input';
import { Camera } from './components/camera';
import { Player } from './components/player';
import { WebGlRendererSystem } from './systems/webgl-renderer-system';
import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from './systems/network-message-system';
import { TransformSystem } from './systems/transform-system';
import { InputSystem } from './systems/input-system';

export default class Game {
  constructor() {
    this.lastTime = performance.now();
    this.lastRenderTime = performance.now();
    this.updatesPerSecond = 60;

    this.world = new World()
      .registerComponent(WebGlRenderer)
      .registerComponent(Connection)
      .registerComponent(Object3d)
      .registerComponent(Transform)
      .registerComponent(Keybindings)
      .registerComponent(Input)
      .registerComponent(Camera)
      .registerComponent(Player)
      .registerSystem(TransformSystem)
      .registerSystem(NetworkEventSystem, this)
      .registerSystem(InputSystem)
      .registerSystem(WebGlRendererSystem, this)
      .registerSystem(NetworkMessageSystem);

    this.updateSystems = this.world.getSystems().filter((system) => {
      return !(system instanceof WebGlRendererSystem);
    });
    this.renderSystem = this.world.getSystem(WebGlRendererSystem);

    this.alpha = 0;

    this.player = undefined;
    this.entities = [];

    const renderer = new WebGlRenderer$1({ antialias: true });
    renderer.setClearColor(0x020207);
    renderer.shadowMap.enabled = true;

    document.body.appendChild(renderer.domElement);

    const scene = new Scene();

    const camera = new PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      4100
    );
    const cameraEntity = this.world
      .createEntity()
      .addComponent(Camera)
      .addComponent(Object3d, { value: camera })
      .addComponent(Transform);

    scene.add(camera);

    scene.add(new AmbientLight(0x222222));

    let light = new DirectionalLight(0xffffff);
    light.position.set(1, 1, 1);
    scene.add(light);

    light = new DirectionalLight(0x002288);
    light.position.set(-1, -1, -1);
    scene.add(light);

    scene.fog = new Fog(0x020207, 0.04);

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
    this.world.stop();

    camera.position.z = 15;

    const loadingManager = new LoadingManager();
    loadingManager.onLoad = this.handleLoad.bind(this);

    this.assetManager = new AssetManager(loadingManager);
    this.assetManager.loadModel({name: 'spaceship', url: 'models/spaceship.gltf'});
    this.assetManager.loadModel({name: 'asteroid', url: 'models/asteroid.gltf'});

    this.addStars(scene, 1000, 4000);
  }

  init() {
    this.fixedUpdate = Utils.createFixedTimestep(
      1000/this.updatesPerSecond,
      this.handleFixedUpdate.bind(this)
    );

    workerInterval.setInterval(this.update.bind(this), 1000/60);
    requestAnimationFrame(this.render.bind(this));

    const geometry = new BoxGeometry(0.1, 0.1, 1);
    const material = new MeshBasicMaterial( {color: 0xffa900} );
    this.bulletMesh = new Mesh(geometry, material);
  }

  handleLoad() {
    this.world.play();
  }

  update() {
    const time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.alpha = this.fixedUpdate(delta, time);

    if (document.hidden) {
      this.world.entityManager.processDeferredRemoval();
    }

    this.lastTime = time;
  }

  render() {
    requestAnimationFrame(this.render.bind(this));

    const time = performance.now();
    let delta = time - this.lastRenderTime;

    if (!document.hidden) {
      this.world.systemManager.executeSystem(this.renderSystem, delta);
      this.world.entityManager.processDeferredRemoval();
    }

    this.lastRenderTime = time;
  }

  handleFixedUpdate(delta, time) {
    if (this.world.enabled) {
      this.updateSystems.forEach((system) => {
        if (system.enabled) {
          this.world.systemManager.executeSystem(system, delta, time);
        }
      });
    }
  }

  handleConnect(connection) {
    this.player = this.world
      .createEntity()
      .addComponent(Connection, { value: connection })
      .addComponent(Input)
      .addComponent(Keybindings, {
        forward: 'KeyE',
        backward: 'KeyD',
        rollLeft: 'KeyW',
        rollRight: 'KeyR',
        strafeLeft: 'KeyS',
        strafeRight: 'KeyF',
        strafeUp: 'Backspace',
        strafeDown: 'Delete',
        boost: 'ShiftLeft',
        weaponPrimary: 0,
      });
  }

  addPlayer(id, kind, position, rotation, scale) {
    const entity = this.world.createEntity()
      .addComponent(Transform, { prevPosition: position, position, rotation, scale })
      .addComponent(Player);

    entity.worldId = id;

    switch (kind) {
      case Types.Entities.SPACESHIP:
        entity.addComponent(Object3d, { value: this.assetManager.getModel('spaceship') });
        break;
    }

    this.entities[id] = entity;
  }

  addEntity(id, kind, position, rotation, scale) {
    const entity = this.world
      .createEntity()
      .addComponent(Transform, {
        prevPosition: position,
        prevRotation: rotation,
        position,
        rotation,
        scale
      });

    entity.worldId = id;

    switch (kind) {
      case Types.Entities.SPACESHIP: {
        entity.addComponent(Object3d, { value: this.assetManager.getModel('spaceship') });
        break;
      }
      case Types.Entities.ASTEROID: {
        entity.addComponent(Object3d, { value: this.assetManager.getModel('asteroid') });
        break;
      }
      case Types.Entities.BULLET: {
        entity.addComponent(Object3d, { value: this.bulletMesh.clone() });
        break;
      }
    }

    this.entities[id] = entity;
  }

  removeEntity(id) {
    this.entities[id].remove();
    delete this.entities[id];
  }

  addStars(scene, count, radius) {
    const positions = [];

    for (let i = 0; i < count; i++) {
      const r = radius;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.cos(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000);
      const y = r * Math.sin(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000);
      const z = r * Math.cos(phi) + (-1000 + Math.random() * 2000);
      positions.push(x);
      positions.push(y);
      positions.push(z);
    }

    var geometry = new BufferGeometry();
    var vertices = new Float32Array(positions);
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    var material = new PointsMaterial({color: 0xffffff, size: 12.5, fog: false});
    var mesh = new Points(geometry, material);
    scene.add(mesh);
  }
}
