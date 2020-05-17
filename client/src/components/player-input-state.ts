import {Component} from 'ecsy';

export class PlayerInputState extends Component {
  movementX: number;
  movementY: number;
  movementZ: number;
  roll: number;

  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.movementX = null;
    this.movementY = null;
    this.movementZ = null;
    this.roll = null;
  }
}
