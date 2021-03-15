import { Component, Types } from 'ecsy';

export class Model extends Component {
  static schema = {
    path: { type: Types.String },
    scene: { type: Types.Ref }
  };
}
