import { Component, Types } from 'ecsy';

export class Object3d extends Component {
  static schema = {
    value: { type: Types.Ref }
  };
}

