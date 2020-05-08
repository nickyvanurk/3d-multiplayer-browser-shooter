import {System} from 'ecsy';
import Velocity from '../components/velocity';
import Position from '../components/position';

export default class Moveable extends System {
  // Define a query of entities that have 'Velocity' and 'Position' components
  static queries = {
    moving: {
      components: [Velocity, Position]
    }
  };

  public queries: any;

  private shapeHalfSize: number;
  private canvasWidth: number;
  private canvasHeight: number;

  init() {
    const shapeSize = 20;
    this.shapeHalfSize = shapeSize / 2;

    let canvas = document.querySelector('canvas');
    this.canvasWidth = canvas.width = window.innerWidth;
    this.canvasHeight = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      this.canvasWidth = canvas.width = window.innerWidth
      this.canvasHeight = canvas.height = window.innerHeight;
    }, false);
  }

  // This method will get called on every frame by default
  execute() {
    // Iterate through all the entities on the query
    this.queries.moving.results.forEach((entity: any) => {
      var velocity = entity.getComponent(Velocity);
      var position = entity.getMutableComponent(Position);

      position.x += velocity.x * (1000/60);
      position.y += velocity.y * (1000/60);

      if (position.x > this.canvasWidth + this.shapeHalfSize) position.x = - this.shapeHalfSize;
      if (position.x < - this.shapeHalfSize) position.x = this.canvasWidth + this.shapeHalfSize;
      if (position.y > this.canvasHeight + this.shapeHalfSize) position.y = - this.shapeHalfSize;
      if (position.y < - this.shapeHalfSize) position.y = this.canvasHeight + this.shapeHalfSize;
    });
  }
}
