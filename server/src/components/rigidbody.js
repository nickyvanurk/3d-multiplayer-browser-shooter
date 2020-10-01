import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

import ThreeTypes from '../../../shared/three-types';

export class RigidBody extends Component {
  static schema = {
    acceleration: { type: Types.Number },
    angularAcceleration: { type: Types.Number },
    velocity: { type: ThreeTypes.Vector3, default: new Vector3() },
    angularVelocity: { type: ThreeTypes.Vector3, default: new Vector3() },
    damping: { type: Types.Number },
    angularDamping: { type: Types.Number }
  };
}

