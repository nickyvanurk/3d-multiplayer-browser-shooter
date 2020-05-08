import {Component} from 'ecsy';

export default class Shape extends Component {
  primitive: string;

  constructor() {
    super();
    this.reset();
  }

  copy(src: Shape) {
    this.primitive = src.primitive;
  }

  reset() {
    this.primitive = 'box';
  }
}
