import {Component} from 'ecsy';

export class PlayerInputState extends Component {
  movementX: number;
  movementY: number;
  movementZ: number;
  roll: number;
  yaw: number;
  pitch: number;

  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.movementX = null;
    this.movementY = null;
    this.movementZ = null;
    this.roll = null;
    this.yaw = null;
    this.pitch = null;
  }

  serialize() {
    return {
      movement: {
        x: this.movementX,
        y: this.movementY,
        z: this.movementZ
      },
      roll: this.roll,
      yaw: this.yaw,
      pitch: this.pitch
    }
  }
}
