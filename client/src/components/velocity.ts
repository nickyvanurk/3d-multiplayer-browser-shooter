import {Component} from 'ecsy';

export default class Velocity extends Component {
  x: number;
  y: number;

  constructor() {
    super();
    this.reset();
  }

  copy(src: Velocity) {
    this.x = src.x;
    this.y = src.y;
  }

  reset() {
    this.x = 0;
    this.y = 0;
  }
}
