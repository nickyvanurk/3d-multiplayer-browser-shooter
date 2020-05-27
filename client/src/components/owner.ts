import {Component, Entity} from 'ecsy';

export class Owner extends Component {
  public value: Entity;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Owner) {
    this.value = src.value;
  }

  reset() {
    this.value = null;
  }
}
