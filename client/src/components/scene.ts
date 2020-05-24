import {Component} from 'ecsy';
import {Scene as Scene$1} from 'three';

export class Scene extends Component {
  public value: Scene$1;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Scene) {
    this.value = src.value;
  }

  reset() {
    this.value = null;
  }
}
