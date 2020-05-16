import {LoadingManager} from 'three';

import './style.css';
import './loader.css';

import {World} from 'ecsy';
import {AssetManager} from './asset-manager';

import {Position} from './components/position';
import {Rotation} from './components/rotation';
import {Object3d} from './components/object3d';
import {NextFrameNormal} from './components/next-frame-normal';

import {Rotate} from './systems/rotate';
import {Render} from './systems/render';

const loadingManager = new LoadingManager(() => {
  const loadingScreen: any = document.querySelector('.loading-screen');
  loadingScreen.classList.add('fade-out');
  loadingScreen.addEventListener('transitionend', () => {
    loadingScreen.style.zIndex = -1;
  });

  const loadingBar: any = document.querySelector('.loading-screen hr');
  loadingBar.addEventListener('transitionend', (event: TransitionEvent) => {
    event.stopPropagation();
  });

  spawnModels(1000);
}, (url, itemsLoaded, itemsTotal) => {
  const progressText: any = document.querySelector('.loading-screen h1');
  progressText.innerText = `${Math.floor(itemsLoaded / itemsTotal * 100)}%`;

  const progressBar: any = document.querySelector('.loading-screen hr');
  progressBar.style.width = `${(itemsLoaded / itemsTotal * 100)}%`;
});

const assetManager = new AssetManager(loadingManager);

assetManager.loadModel({name: 'spaceship', url: 'models/spaceship.gltf'});

const world = new World();
world
  .registerSystem(Rotate)
  .registerSystem(Render);

function spawnModels(amount: number) {
  const model = assetManager.getModel('spaceship');

  for (let i = 0; i < amount - 1; ++i) {
    world.createEntity()
      .addComponent(Object3d, {value: model.scene.clone()})
      .addComponent(Position, {
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 60,
        z: (Math.random() - 0.5) * 60
      })
      .addComponent(Rotation);
  }

  world.createEntity()
      .addComponent(Object3d, {value: model.scene.clone()})
      .addComponent(Position)
      .addComponent(Rotation);
}

let lastTime = performance.now();

function run() {
  let time = performance.now();
  let delta = time - lastTime;

  world.execute(delta, time);

  lastTime = time;
  requestAnimationFrame(run);
}

run();

import geckos from '@geckos.io/client';

const channel = geckos({port: parseInt(process.env.PORT || '3000')});

channel.onConnect((error: any) => {
  if (error) {
    console.error(error.message);
    return;
  }

  channel.onDisconnect(() => {
    console.log('Disconnected from server');
  });

  channel.on('chat message', (data: any) => {
    console.log(`received: ${data}`);
  })

  channel.emit('chat message', 'a short message sent to the server');
});
