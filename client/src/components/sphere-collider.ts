import {Component} from 'ecsy';

export class SphereCollider extends Component {
  public radius: number;
  public isTrigger: boolean;
  public raycast: boolean;

  constructor() {
    super();

    this.reset();
  }

  copy(src: SphereCollider) {
    this.radius = src.radius || this.radius;
    this.isTrigger = src.isTrigger || this.isTrigger;
    this.raycast = src.raycast || this.raycast;
  }

  reset() {
    this.radius = null;
    this.isTrigger = false;
    this.raycast = false
  }
}
