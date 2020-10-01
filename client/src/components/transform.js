import { Component } from 'ecsy';
import { Vector3 } from 'three';

import ThreeTypes from '../../../shared/three-types';

export class Transform extends Component {
  static schema = {
    prevPosition: { type: ThreeTypes.Vector3, default: new Vector3() },
    prevRotation: { type: ThreeTypes.Vector3, default: new Vector3() },
    position: { type: ThreeTypes.Vector3, default: new Vector3() },
    rotation: { type: ThreeTypes.Vector3, default: new Vector3() }
  };
}

