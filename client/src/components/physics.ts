import {Component} from 'ecsy';
import {Vector3} from 'three';

export class Physics extends Component {
  velocity: Vector3;
  acceleration: number;
  damping: number;

  constructor() {
    super();
    this.velocity = new Vector3();
    this.acceleration = 0.00001;
    this.damping = 0.3;
  }

  copy(src: Physics) {
    this.velocity.copy(src.velocity);
    this.acceleration = src.acceleration;
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.acceleration = 0;
  }
}
