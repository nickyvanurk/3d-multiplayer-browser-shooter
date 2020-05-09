import './style.css';

import * as THREE from 'three';
// import {World} from 'ecsy';

// import Velocity from './components/velocity';
// import Position from './components/position';
// import Shape from './components/shape';
// import Renderable from './components/renderable';

// import Moveable from './systems/moveable';
// import Renderer from './systems/renderer';

// const MS_PER_UPDATE = 1000 / 60;

// Initialize canvas
let canvas = document.querySelector('canvas');
let canvasWidth = canvas.width = window.innerWidth;
let canvasHeight = canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  canvasWidth = canvas.width = window.innerWidth
  canvasHeight = canvas.height = window.innerHeight;
}, false);

const scene: any = new THREE.Scene();
scene.fog = new THREE.Fog(0x020207, 100, 700);
const camera: any = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer: any = new THREE.WebGLRenderer({canvas});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(new THREE.Color('#020207'));
document.body.appendChild(renderer.domElement);

var geometry = new THREE.BoxGeometry();
var material = new THREE.MeshBasicMaterial({color: 0x00ff00});
var cube: any = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 5;



// // Create world and register the systems on it
// var world = new World();
// world
//   .registerSystem(Moveable)
//   .registerSystem(Renderer);
// world.getSystem(Renderer).stop();

// // Some helper functions when creating the components
// function getRandomVelocity() {
//   return {
//     x: SPEED_MULTIPLIER * (2 * Math.random() - 1),
//     y: SPEED_MULTIPLIER * (2 * Math.random() - 1)
//   };
// }

// function getRandomPosition() {
//   return {
//     x: Math.random() * canvasWidth,
//     y: Math.random() * canvasHeight
//   };
// }

// function getRandomShape() {
//     return {
//       primitive: Math.random() >= 0.5 ? 'circle' : 'box'
//     };
// }



let lag = 0;

// Run!
function run() {
  // Compute delta and elapsed time
  let time = performance.now();
  let delta = time - lastTime;
  lag += delta;

  // while (lag >= MS_PER_UPDATE) {
  //   // Run all the systems
  //   world.execute();
  //   lag -= MS_PER_UPDATE;
  // }

  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
//   world.getSystem(Renderer).execute(delta, time, lag / MS_PER_UPDATE);

  lastTime = time;
  requestAnimationFrame(run);
}

let lastTime = performance.now();
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
