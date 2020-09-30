import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

export class RigidBody extends Component {
  static schema = {
    acceleration: { type: Types.Number },
    angularAcceleration: { type: Types.Number },
    velocity: { type: Types.Ref, default: new Vector3() },
    angularVelocity: { type: Types.Ref, default: new Vector3() },
    damping: { type: Types.Number },
    angularDamping: { type: Types.Number }
  };
}

