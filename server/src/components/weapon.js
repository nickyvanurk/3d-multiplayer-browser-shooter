import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

import ThreeTypes from '../../../shared/three-types';

export class Weapon extends Component {
  static schema = {
    offset: { type: ThreeTypes.Vector3, default: new Vector3() },
    fireInterval: { type: Types.Number, default: 100 },
    lastFiredTimestamp: { type: Types.Number, default: null },
    parent: { type: Types.Ref }
  };
}

