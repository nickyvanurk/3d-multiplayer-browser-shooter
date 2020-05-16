import {Component} from 'ecsy';

export class NextFrameNormal extends Component {
  value: number;

  constructor() {
    super();
    this.reset();
  }

  copy(src: NextFrameNormal) {
    this.value = src.value;
  }

  reset() {
    this.value = 0;
  }
}
