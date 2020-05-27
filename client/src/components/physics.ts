import {Component} from 'ecsy';
import {Vector3} from 'three';

export class Physics extends Component {
  velocity: Vector3;
  angularVelocity: Vector3;
  acceleration: number;
  angularAcceleration: number;
  damping: number;
  angularDamping: number;

  constructor() {
    super();
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.acceleration = 0.00002;
    this.angularAcceleration = 0.000003;
    this.damping = 0.3;
    this.angularDamping = 0.1;
  }

  copy(src: Physics) {
    if (src.velocity) {
      this.velocity.copy(src.velocity);
    }

    if (src.angularVelocity) {
      this.angularVelocity.copy(src.angularVelocity)
    };

    this.acceleration = src.acceleration || this.acceleration;
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.acceleration = 0;
  }
}
