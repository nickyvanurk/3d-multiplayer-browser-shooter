import {Component} from 'ecsy';

export class PlayerController extends Component {
  rollLeft: string;
  rollRight: string;
  forward: string;
  backward: string;
  strafeUp: string;
  strafeDown: string;
  strafeLeft: string;
  strafeRight: string;
  weaponPrimary: string;

  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.rollLeft = null;
    this.rollRight = null;
    this.forward = null;
    this.backward = null;
    this.strafeUp = null;
    this.strafeDown = null;
    this.strafeLeft = null;
    this.strafeRight = null;
    this.weaponPrimary = null;
  }
}
