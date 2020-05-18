import {Component} from 'ecsy';
import {Vector3} from 'three';

export class Transform extends Component {
  position: Vector3;
  rotation: Vector3;
  translation: Vector3;

  constructor() {
    super();
    this.position = new Vector3();
    this.rotation = new Vector3();
    this.translation = new Vector3();
  }

  copy(src: Transform) {
    this.position.copy(src.position);
    this.rotation.copy(src.rotation);
  }

  reset() {
    this.position.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    this.translation.set(0, 0, 0);
  }
}
