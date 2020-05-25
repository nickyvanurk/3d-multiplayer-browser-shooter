import {Component} from 'ecsy';
import {Vector3} from 'three';

export class Gun extends Component {
  public offset: Vector3;
  public firingRate: number;
  public lastFiredTimestamp: number;

  constructor() {
    super();

    this.offset = new Vector3();
    this.reset();
  }

  copy(src: Gun) {
    this.offset.copy(src.offset);
    this.firingRate = src.firingRate || this.firingRate;
    this.lastFiredTimestamp = src.lastFiredTimestamp || this.lastFiredTimestamp;
  }

  reset() {
    this.offset.set(0, 0, 0);
    this.firingRate = 100;
    this.lastFiredTimestamp = null;
  }
}
