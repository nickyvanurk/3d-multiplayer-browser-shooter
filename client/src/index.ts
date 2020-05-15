import {LoadingManager} from 'three';

import './style.css';
import './loader.css';

import {World} from 'ecsy';
import {AssetManager} from './asset-manager';

import {Position} from './components/position';
import {Rotation} from './components/rotation';
import {Object3d} from './components/object3d';

import {Rotate} from './systems/rotate';
import {Render} from './systems/render';

const loadingManager = new LoadingManager(() => {
  console.log('done');

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
world.getSystem(Render).stop();

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

const MS_PER_UPDATE = 1000 / 60;

let lastTime = performance.now();
let lag = 0;

function run() {
  let time = performance.now();
  let delta = time - lastTime;
  lag += delta;

  while (lag >= MS_PER_UPDATE) {
    world.execute(MS_PER_UPDATE, time);
    lag -= MS_PER_UPDATE;
  }

  world.getSystem(Render).execute(delta, time);

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
