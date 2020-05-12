import './style.css';

import {World} from 'ecsy';
import {AssetManager} from './asset-manager';

import {Position} from './components/position';
import {Rotation} from './components/rotation';
import {Object3d} from './components/object3d';

import {Rotate} from './systems/rotate';
import {Render} from './systems/render';

const assetManager = new AssetManager();

assetManager.onStart((url: string, itemsLoaded: number, itemsTotal: number) => {
  console.log(`Started loading file: ${url}.\nLoaded ${itemsLoaded} of ${itemsTotal} files.`);
});

assetManager.onProgress((url: string, itemsLoaded: number, itemsTotal: number) => {
  console.log(`Loading file: ${url}.\nLoaded ${itemsLoaded} of ${itemsTotal} files.`);
});

assetManager.onLoad(() => {
  console.log('Loading complete!');
  spawnModels(1000);
});

assetManager.onError((url: string) => {
  console.log(`There was an error loading ${url}`);
});

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
