import {Component} from 'ecsy';

export default class Position extends Component {
  x: number;
  y: number;

  constructor() {
    super();
    this.reset();
  }

  copy(src: Position) {
    this.x = src.x;
    this.y = src.y;
  }

  reset() {
    this.x = 0;
    this.y = 0;
  }
}
