import {Component} from 'ecsy';

export class Position extends Component {
  x: number;
  y: number;
  z: number;

  constructor() {
    super();
    this.reset();
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
