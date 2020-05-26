import {Component, Entity} from 'ecsy';

export class Weapons extends Component {
  public primary: Array<Entity>;

  constructor() {
    super();

    this.primary = [];
    this.reset();
  }

  copy(src: Weapons) {
    this.primary = src.primary || this.primary;
  }

  reset() {
    this.primary.length = 0;
  }
}
