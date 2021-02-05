import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

import ThreeTypes from '../../../shared/three-types';

export class Aim extends Component {
  static schema = {
    position: { type: ThreeTypes.Vector3, default: new Vector3() },
    direction: { type: ThreeTypes.Vector3, default: new Vector3() },
    distance: { type: Types.Number, default: 1000, },
  };
}
