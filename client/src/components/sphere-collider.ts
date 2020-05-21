import {Component} from 'ecsy';

export class SphereCollider extends Component {
  radius: number;

  constructor() {
    super();
    this.reset();
  }

  copy(src: SphereCollider) {
    this.radius = src.radius;
  }

  reset() {
    this.radius = null;
  }
}
