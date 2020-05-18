import './loader.css';

import {LoadingManager} from 'three';
import {AssetManager} from './asset-manager';
import {World} from 'ecsy';

import {Position} from './components/position';
import {Rotation} from './components/rotation';
import {Object3d} from './components/object3d';
import {PlayerController} from './components/player-controller';
import {CameraGoal} from './components/camera-goal';

import {Rotate} from './systems/rotate';
import {Render} from './systems/render';
import {Input} from './systems/input';
import {PlayerInput} from './systems/player-input';
import {PlayerMovement} from './systems/player-movement';

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
    const progressText: any = document.querySelector('.loading-screen h1');
    progressText.innerText = `${Math.floor(itemsLoaded / itemsTotal * 100)}%`;

    const progressBar: any = document.querySelector('.loading-screen hr');
    progressBar.style.width = `${(itemsLoaded / itemsTotal * 100)}%`;
  }

  init() {
    const loadingScreen: any = document.querySelector('.loading-screen');
    loadingScreen.classList.add('fade-out');
    loadingScreen.addEventListener('transitionend', () => {
      loadingScreen.style.zIndex = -1;
    });

    const loadingBar: any = document.querySelector('.loading-screen hr');
    loadingBar.addEventListener('transitionend', (event: TransitionEvent) => {
      event.stopPropagation();
    });

    this.world
      .registerSystem(Input)
      .registerSystem(PlayerInput)
      .registerSystem(Rotate)
      .registerSystem(PlayerMovement)
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

  spawnModels(amount: number) {
    const model = this.assetManager.getModel('spaceship');

    for (let i = 0; i < amount - 1; ++i) {
      this.world.createEntity()
        .addComponent(Object3d, {value: model.scene.clone()})
        .addComponent(Position, {
          x: (Math.random() - 0.5) * 60,
          y: (Math.random() - 0.5) * 60,
          z: (Math.random() - 0.5) * 60
        })
        .addComponent(Rotation);
    }
  }

  spawnPlayer() {
    const model = this.assetManager.getModel('spaceship');

    this.world.createEntity()
      .addComponent(Object3d, {value: model.scene.clone()})
      .addComponent(Position)
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
      .addComponent(CameraGoal, {x: 0, y: 250, z: -1000});
  }
}
