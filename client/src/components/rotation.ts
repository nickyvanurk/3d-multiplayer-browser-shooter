import {Component} from 'ecsy';

export class Rotation extends Component {
  x: number;
  y: number;
  z: number;

  constructor() {
    super();
    this.reset();
  }

  copy(src: Rotation) {
    this.x = src.x;
    this.y = src.y;
    this.z = src.z;
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}
