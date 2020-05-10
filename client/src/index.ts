import './style.css';

import {World} from 'ecsy';
import * as THREE from 'three';

import {Position} from './components/position';
import {Rotation} from './components/rotation';
import {Object3d} from './components/object3d';

import {GltfLoading} from './systems/gltf-loading';
import {Rotate} from './systems/rotate';
import {Render} from './systems/render';

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';

const MS_PER_UPDATE = 1000 / 60;

const world = new World();
world
  .registerSystem(GltfLoading)
  .registerSystem(Rotate)
  .registerSystem(Render);
world.getSystem(Render).stop();

const loader = new GLTFLoader();

loader.load('models/spaceship.gltf', (gltf: any) => {
  gltf.scene.traverse((child: any) => {
    if (child.isMesh) {
      child.receiveShadow = true;
      child.castShadow = true;
    }
  });

  gltf.scene.scale.set(0.005, 0.005, 0.005);

  for (let i = 0; i < 1000; ++i) {
    world.createEntity()
      .addComponent(Object3d, {value: gltf.scene.clone()})
      .addComponent(Position, {
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 60,
        z: (Math.random() - 0.5) * 60
      })
      .addComponent(Rotation);
  }
});

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
