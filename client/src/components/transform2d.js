import { Component, Types } from 'ecsy';
import { Vector2 } from 'three';

import ThreeTypes from '../../../shared/three-types';

export class Transform2D extends Component {
  static schema = {
    prevPosition: { type: ThreeTypes.Vector2, default: new Vector2() },
    prevRotation: { type: Types.Number },
    position: { type: ThreeTypes.Vector2, default: new Vector2() },
    rotation: { type: Types.Number },
    scale: { type: Types.Number, default: 1 }
  };
}
