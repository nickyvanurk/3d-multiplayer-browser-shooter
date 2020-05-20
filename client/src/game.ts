import './loader.css';

import {LoadingManager} from 'three';
import {AssetManager} from './asset-manager';
import {World} from 'ecsy';

import {Vector3} from 'three';

import {Transform} from './components/transform';
import {Rotating} from './components/rotating';
import {Object3d} from './components/object3d';
import {PlayerController} from './components/player-controller';
import {Physics} from './components/physics';

import {Render} from './systems/render';
import {Input} from './systems/input';
import {PlayerInput} from './systems/player-input';
import {PhysicsSystem} from './systems/physics-system';

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
      .registerSystem(Input)
      .registerSystem(PlayerInput)
      .registerSystem(PhysicsSystem)
      .registerSystem(Render);

    this.spawnModels(1000);
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
        .addComponent(Rotating);
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
      .addComponent(Physics);
  }
}
