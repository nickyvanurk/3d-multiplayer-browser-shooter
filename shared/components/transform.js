import { Component } from 'ecsy';
import { Vector3 } from 'three';

import ThreeTypes from '../three-types';

export class Transform extends Component {
  static schema = {
    position: { type: ThreeTypes.Vector3, default: new Vector3() },
    rotation: { type: ThreeTypes.Vector3, default: new Vector3() }
  };
}

