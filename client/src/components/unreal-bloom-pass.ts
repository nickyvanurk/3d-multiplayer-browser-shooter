import {Component} from 'ecsy';

export class UnrealBloomPass extends Component {
  public strength: number;
  public radius: number;
  public threshold: number;

  constructor() {
    super();

    this.reset();
  }

  copy(src: UnrealBloomPass) {
    this.strength = src.strength;
    this.radius = src.radius;
    this.threshold = src.threshold;
  }

  reset() {
    this.strength = 1.6;
    this.radius = 1;
    this.threshold = 0;
  }
}
