import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

export class Transform extends Component {
  static schema = {
    position: { type: Types.Ref, default: new Vector3() },
    rotation: { type: Types.Ref, default: new Vector3() }
  };
}

