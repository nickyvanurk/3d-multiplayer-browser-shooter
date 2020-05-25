import './loader.css';

import {
  LoadingManager,
  Scene as Scene$1,
  Vector3,
  AmbientLight,
  DirectionalLight,
  Fog,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Points
} from 'three';
import {AssetManager} from './asset-manager';
import {World} from 'ecsy';

import {Transform} from './components/transform';
import {Rotating} from './components/rotating';
import {Object3d} from './components/object3d';
import {PlayerController} from './components/player-controller';
import {Physics} from './components/physics';
import {SphereCollider} from './components/sphere-collider';
import {Camera} from './components/camera';
import {Scene} from './components/scene';
import {WebGlRenderer} from './components/webgl-renderer';
import {RenderPass} from './components/render-pass';
import {UnrealBloomPass} from './components/unreal-bloom-pass';

import {WebGlRendererSystem} from './systems/webgl-renderer-system';
import {Input} from './systems/input';
import {PlayerInput} from './systems/player-input';
import {PhysicsSystem} from './systems/physics-system';
import {CameraSystem} from './systems/camera-system';
import {TransformSystem} from './systems/transform-system';

export default class Game {
  private lastTime: number;
  private world: World;
  private assetManager: AssetManager;

  constructor() {
    this.lastTime = performance.now();

    const loadingManager = new LoadingManager();
    loadingManager.onLoad = this.init.bind(this);
    loadingManager.onProgress = this.handleProgress.bind(this);

    this.assetManager = new AssetManager(loadingManager);
    this.assetManager.loadModel({name: 'spaceship', url: 'models/spaceship.gltf'});

    this.world = new World();
  }

  handleProgress(url: string, itemsLoaded: number, itemsTotal: number) {
    this.updateLoadingScreen(Math.floor(itemsLoaded / itemsTotal * 100));
  }

  init() {
    this.hideLoadingScreen();

    this.world
      .registerSystem(CameraSystem)
      .registerSystem(Input)
      .registerSystem(PlayerInput)
      .registerSystem(PhysicsSystem)
      .registerSystem(TransformSystem)
      .registerSystem(WebGlRendererSystem);

    this.world.createEntity().addComponent(WebGlRenderer);

    const scene = new Scene$1();
    this.world.createEntity().addComponent(Scene, {value: scene});

    this.world.createEntity().addComponent(RenderPass);
    this.world.createEntity().addComponent(UnrealBloomPass);

    const camera = this.world.createEntity()
      .addComponent(Camera, {
        fov: 70,
        aspect: window.innerWidth / window.innerHeight,
        near: 0.1,
        far: 10000,
        handleResize: true
      })
      .addComponent(Transform);

    const transform = camera.getMutableComponent(Transform);
    transform.position.y = 1;
    transform.position.z = -4;

    scene.add(new AmbientLight(0x222222));

    let light = new DirectionalLight(0xffffff);
    light.position.set(1, 1, 1);
    scene.add(light);

    light = new DirectionalLight(0x002288);
    light.position.set(-1, -1, -1);
    scene.add(light);

    scene.fog = new Fog(0x020207, 0.04);

    const positions = []
    for (let i = 0; i < 2000; i++) {
      const r = 4000
      const theta = 2 * Math.PI * Math.random()
      const phi = Math.acos(2 * Math.random() - 1)
      const x = r * Math.cos(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000)
      const y = r * Math.sin(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000)
      const z = r * Math.cos(phi) + (-1000 + Math.random() * 2000)
      positions.push(x)
      positions.push(y)
      positions.push(z)
    }

    var geometry = new BufferGeometry();
    var vertices = new Float32Array(positions);
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    var material = new PointsMaterial({color: 0xffffff, size: 12.5, fog: false});
    var mesh = new Points(geometry, material);
    scene.add(mesh);

    this.spawnModels(100);
    this.spawnPlayer();
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    this.world.execute(delta, time);

    this.lastTime = time;

    requestAnimationFrame(this.run.bind(this));
  }

  updateLoadingScreen(percentage: number) {
    const progressText: any = document.querySelector('.loading-screen h1');
    progressText.innerText = `${percentage}%`;

    const progressBar: any = document.querySelector('.loading-screen hr');
    progressBar.style.width = `${percentage}%`;
  }

  hideLoadingScreen() {
    const loadingScreen: any = document.querySelector('.loading-screen');
    loadingScreen.classList.add('fade-out');
    loadingScreen.addEventListener('transitionend', () => {
      loadingScreen.style.zIndex = -1;
    });

    const loadingBar: any = document.querySelector('.loading-screen hr');
    loadingBar.addEventListener('transitionend', (event: TransitionEvent) => {
      event.stopPropagation();
    });
  }

  spawnModels(amount: number) {
    const model = this.assetManager.getModel('spaceship');

    for (let i = 0; i < amount; ++i) {
      this.world.createEntity()
        .addComponent(Object3d, {value: model.scene.clone()})
        .addComponent(Transform, {
          position: new Vector3(
            (Math.random() - 0.5) * 120,
            (Math.random() - 0.5) * 120,
            (Math.random() - 0.5) * 120
          ),
          rotation: new Vector3()
        })
        .addComponent(Physics)
        .addComponent(Rotating)
        .addComponent(SphereCollider, {radius: 1});
    }
  }

  spawnPlayer() {
    const model = this.assetManager.getModel('spaceship');

    this.world.createEntity()
      .addComponent(Object3d, {value: model.scene.clone()})
      .addComponent(Transform)
      .addComponent(PlayerController, {
        rollLeft: 'KeyQ',
        rollRight: 'KeyE',
        forward: 'KeyW',
        backward: 'KeyS',
        strafeLeft: 'KeyA',
        strafeRight: 'KeyD',
        strafeUp: 'Space',
        strafeDown: 'ControlLeft',
      })
      .addComponent(Physics)
      .addComponent(SphereCollider, {radius: 1});
  }
}
