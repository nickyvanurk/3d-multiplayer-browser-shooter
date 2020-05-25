import {Component, Entity} from 'ecsy';

export class Weapon extends Component {
  public value: Entity;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Weapon) {
    this.value = src.value;
  }

  reset() {
    this.value = null;
  }
}
