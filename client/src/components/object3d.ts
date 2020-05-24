import {Component} from 'ecsy';

export class Object3d extends Component {
  value: any;

  constructor() {
    super();
    this.reset();
  }

  copy(src: Object3d) {
    this.value = src.value;
  }

  reset() {
    this.value = null;
  }
}
