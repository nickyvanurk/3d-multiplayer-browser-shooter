import {Component, Entity} from 'ecsy';
import {Vector3} from 'three';

export enum WeaponType {
  Gun
};

export class Weapon extends Component {
  public type: WeaponType;
  public offset: Vector3;
  public fireInterval: number;
  public lastFiredTimestamp: number;
  public parent: Entity;

  constructor() {
    super();

    this.offset = new Vector3();

    this.reset();
  }

  copy(src: Weapon) {
    this.type = src.type || this.type;

    if (src.offset) {
      this.offset.copy(src.offset);
    }

    this.fireInterval = src.fireInterval || this.fireInterval;
    this.lastFiredTimestamp = src.lastFiredTimestamp || this.lastFiredTimestamp;
    this.parent = src.parent || this.parent;
  }

  reset() {
    this.type = null;
    this.offset.set(0, 0, 0);
    this.fireInterval = 100;
    this.lastFiredTimestamp = null;
    this.parent = null;
  }
}
