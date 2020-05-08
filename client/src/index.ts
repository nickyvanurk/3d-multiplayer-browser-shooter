import './style.css';

import {World} from 'ecsy';

import Velocity from './components/velocity';
import Position from './components/position';
import Shape from './components/shape';
import Renderable from './components/renderable';

import Moveable from './systems/moveable';
import Renderer from './systems/renderer';

const NUM_ELEMENTS = 1000;
const SPEED_MULTIPLIER = 0.1;
const MS_PER_UPDATE = 1000 / 60;

// Initialize canvas
let canvas = document.querySelector('canvas');
let canvasWidth = canvas.width = window.innerWidth;
let canvasHeight = canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  canvasWidth = canvas.width = window.innerWidth
  canvasHeight = canvas.height = window.innerHeight;
}, false);

// Create world and register the systems on it
var world = new World();
world
  .registerSystem(Moveable)
  .registerSystem(Renderer);
world.getSystem(Renderer).stop();

// Some helper functions when creating the components
function getRandomVelocity() {
  return {
    x: SPEED_MULTIPLIER * (2 * Math.random() - 1),
    y: SPEED_MULTIPLIER * (2 * Math.random() - 1)
  };
}

function getRandomPosition() {
  return {
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight
  };
}

function getRandomShape() {
    return {
      primitive: Math.random() >= 0.5 ? 'circle' : 'box'
    };
}

for (let i = 0; i < NUM_ELEMENTS; i++) {
  world
    .createEntity()
    .addComponent(Velocity, getRandomVelocity())
    .addComponent(Shape, getRandomShape())
    .addComponent(Position, getRandomPosition())
    .addComponent(Renderable)
}

let lag = 0;

// Run!
function run() {
  // Compute delta and elapsed time
  var time = performance.now();
  var delta = time - lastTime;
  lag += delta;

  while (lag >= MS_PER_UPDATE) {
    // Run all the systems
    world.execute();
    lag -= MS_PER_UPDATE;
  }

  world.getSystem(Renderer).execute(delta, time, lag / MS_PER_UPDATE);

  lastTime = time;
  requestAnimationFrame(run);
}

var lastTime = performance.now();
run();
