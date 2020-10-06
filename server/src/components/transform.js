import { Component, Types } from 'ecsy';
import { Vector3, Quaternion } from 'three';

import ThreeTypes from '../../../shared/three-types';

export class Transform extends Component {
  static schema = {
    position: { type: ThreeTypes.Vector3, default: new Vector3() },
    rotation: { type: ThreeTypes.Quaternion, default: new Quaternion() },
    scale: { type: Types.Number, default: 1 }
  };
}

