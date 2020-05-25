import {Component, Entity} from 'ecsy';

export class CollisionStop extends Component {
  public collidingWidth: Array<Entity>;

  constructor() {
    super();

    this.collidingWidth = [];
  }

  copy(src: CollisionStop) {
    this.collidingWidth = src.collidingWidth || this.collidingWidth;
  }

  reset() {
    this.collidingWidth.length = 0;
  }
}
