import {Component} from 'ecsy';
import {Mesh} from 'three';

export class Object3d extends Component {
  value: Mesh;

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
