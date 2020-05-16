import {Component} from 'ecsy';

export class NextFrameNormal extends Component {
  timestep: number;
  value: number;

  constructor() {
    super();
    this.reset();
  }

  copy(src: NextFrameNormal) {
    this.timestep = src.timestep;
    this.value = src.value;
  }

  reset() {
    this.timestep = 0;
    this.value = 0;
  }
}
