import './style.css';

import {World, System} from 'ecsy';

import Velocity from './components/velocity';
import Position from './components/position';
import Shape from './components/shape';
import Renderable from './components/renderable';

import Moveable from './systems/moveable';
import Renderer from './systems/renderer';

const NUM_ELEMENTS = 100;
const SPEED_MULTIPLIER = 0.3;

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

// Run!
function run() {
  // Compute delta and elapsed time
  var time = performance.now();
  var delta = time - lastTime;

  // Run all the systems
  world.execute(delta, time);

  lastTime = time;
  requestAnimationFrame(run);
}

var lastTime = performance.now();
run();
