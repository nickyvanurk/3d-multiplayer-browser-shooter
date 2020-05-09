import {Component} from 'ecsy';

export class Position extends Component {
  x: number;
  y: number;
  z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    super();

    this.x = x;
    this.y = y;
    this.z = z;
  }

  copy(src: Position) {
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
