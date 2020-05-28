import {Component} from 'ecsy';

export class Health extends Component {
  public value: number;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Health) {
    this.value = src.value || this.value;
  }

  reset() {
    this.value = null;
  }
}
