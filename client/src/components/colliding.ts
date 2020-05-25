import {Component, Entity} from 'ecsy';

export class Colliding extends Component {
  public collidingWidth: Array<Entity>;
  public collidingFrame: number;

  constructor() {
    super();

    this.collidingWidth = [];
    this.collidingFrame = 0;
  }

  copy(src: Colliding) {
    this.collidingWidth = src.collidingWidth || this.collidingWidth;
    this.collidingFrame = src.collidingFrame || this.collidingFrame;
  }

  reset() {
    this.collidingWidth.length = 0;
    this.collidingFrame = 0;
  }
}
