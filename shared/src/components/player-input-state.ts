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
    this.movementX = 0;
    this.movementY = 0;
    this.movementZ = 0;
    this.roll = 0;
    this.yaw = 0;
    this.pitch = 0;
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
