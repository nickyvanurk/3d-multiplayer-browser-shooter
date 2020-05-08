import './style.css';

import {World, System, TagComponent} from '../node_modules/ecsy/build/ecsy.module';

const NUM_ELEMENTS = 50;
const SPEED_MULTIPLIER = 0.3;
const SHAPE_SIZE = 50;
const SHAPE_HALF_SIZE = SHAPE_SIZE / 2;

// Initialize canvas
let canvas = document.querySelector('canvas');
let canvasWidth = canvas.width = window.innerWidth;
let canvasHeight = canvas.height = window.innerHeight;
let ctx = canvas.getContext('2d');

window.addEventListener('resize', () => {
  canvasWidth = canvas.width = window.innerWidth
  canvasHeight = canvas.height = window.innerHeight;
}, false);

//----------------------
// Components
//----------------------

// Velocity component
class Velocity {
  x: number;
  y: number;

  constructor() {
    this.x = 0;
    this.y = 0;
  }
}

// Position component
class Position {
  x: number;
  y: number;

  constructor() {
    this.x = 0;
    this.y = 0;
  }
}

// Shape component
class Shape {
  primitive: string;

  constructor() {
    this.primitive = 'box';
  }
}

// Renderable component
class Renderable extends TagComponent {}

//----------------------
// Systems
//----------------------

// MovableSystem
class MovableSystem extends System {
  // Define a query of entities that have 'Velocity' and 'Position' components
  static queries = {
    moving: {
      components: [Velocity, Position]
    }
  };

  queries: any;

  // This method will get called on every frame by default
  execute(delta: number, time: number) {
    // Iterate through all the entities on the query
    this.queries.moving.results.forEach((entity: any) => {
      var velocity = entity.getComponent(Velocity);
      var position = entity.getMutableComponent(Position);
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;

      if (position.x > canvasWidth + SHAPE_HALF_SIZE) position.x = - SHAPE_HALF_SIZE;
      if (position.x < - SHAPE_HALF_SIZE) position.x = canvasWidth + SHAPE_HALF_SIZE;
      if (position.y > canvasHeight + SHAPE_HALF_SIZE) position.y = - SHAPE_HALF_SIZE;
      if (position.y < - SHAPE_HALF_SIZE) position.y = canvasHeight + SHAPE_HALF_SIZE;
    });
  }
}

// RendererSystem
class RendererSystem extends System {
  // Define a query of entities that have 'Renderable' and 'Shape' components
  static queries = {
    renderables: { components: [Renderable, Shape] }
  };

  queries: any;

  // This method will get called on every frame by default
  execute(delta: number, time: number) {

    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Iterate through all the entities on the query
    this.queries.renderables.results.forEach((entity: any) => {
      var shape = entity.getComponent(Shape);
      var position = entity.getComponent(Position);
      if (shape.primitive === 'box') {
        this.drawBox(position);
      } else {
        this.drawCircle(position);
      }
    });
  }

  drawCircle(position: any) {
    ctx.beginPath();
    ctx.arc(position.x, position.y, SHAPE_HALF_SIZE, 0, 2 * Math.PI, false);
    ctx.fillStyle= '#39c495';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0b845b';
    ctx.stroke();
  }

  drawBox(position: any) {
    ctx.beginPath();
    ctx.rect(position.x - SHAPE_HALF_SIZE, position.y - SHAPE_HALF_SIZE, SHAPE_SIZE, SHAPE_SIZE);
    ctx.fillStyle= '#e2736e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b74843';
    ctx.stroke();
  }
}

// Create world and register the systems on it
var world = new World();
world
  .registerSystem(MovableSystem)
  .registerSystem(RendererSystem);

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
