import {Component} from 'ecsy';

export class Screenshake extends Component {
  public strength: number;
  public damping: number;
  public distance: number;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Screenshake) {
    this.strength = src.strength;
    this.damping = src.damping;
    this.distance = src.distance || this.distance;
  }

  reset() {
    this.strength = null;
    this.damping = null;
    this.distance = null;
  }
}
