import {Component} from 'ecsy';

export class Damage extends Component {
  public value: number;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Damage) {
    this.value = src.value || this.value;
  }

  reset() {
    this.value = null;
  }
}
