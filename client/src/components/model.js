import { Component, Types } from 'ecsy';

export class Model extends Component {
  static schema = {
    path: { type: Types.String },
    loadingProgess: { type: Types.Number },
    isLoaded: { type: Types.Boolean },
    scene: { type: Types.Ref }
  };
}
