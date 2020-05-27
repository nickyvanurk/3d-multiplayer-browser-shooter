import {Component} from 'ecsy';

export class SphereCollider extends Component {
  public isTrigger: boolean;
  public radius: number;

  constructor() {
    super();

    this.reset();
  }

  copy(src: SphereCollider) {
    this.isTrigger = src.isTrigger || this.isTrigger;
    this.radius = src.radius || this.radius;
  }

  reset() {
    this.isTrigger = false;
    this.radius = null;
  }
}
