import {Component, Entity} from 'ecsy';

export class CollisionStart extends Component {
  public collidingWidth: Array<Entity>;

  constructor() {
    super();

    this.collidingWidth = [];
  }

  copy(src: CollisionStart) {
    this.collidingWidth = src.collidingWidth || this.collidingWidth;
  }

  reset() {
    this.collidingWidth.length = 0;
  }
}
