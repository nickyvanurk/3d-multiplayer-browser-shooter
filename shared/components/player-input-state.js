import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

export class PlayerInputState extends Component {
  static schema = {
    movementX: { type: Types.Number },
    movementY: { type: Types.Number },
    movementZ: { type: Types.Number },
    roll: { type: Types.Number },
    yaw: { type: Types.Number },
    pitch: { type: Types.Number },
    boost: { type: Types.Boolean },
    weaponPrimary: { type: Types.Boolean },
    aim: { type: Types.Ref, default: { position: 0, direction: new Vector3() } }
  };
}

