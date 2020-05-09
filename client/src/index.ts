import './style.css';

import {World} from 'ecsy';
import * as THREE from 'three';

import {Object3d} from './components/object3d';
import {Position} from './components/position';
import {Rotation} from './components/rotation';

import {Rotate} from './systems/rotate';
import {Render} from './systems/render';

const MS_PER_UPDATE = 1000 / 60;

const world = new World();
world
  .registerSystem(Rotate)
  .registerSystem(Render);
world.getSystem(Render).stop();

var geometry = new THREE.BoxGeometry();
var material = new THREE.MeshBasicMaterial({color: 0x00ff00});
const mesh = new THREE.Mesh(geometry, material);

world.createEntity()
  .addComponent(Object3d, {value: mesh})
  .addComponent(Position)
  .addComponent(Rotation);

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
