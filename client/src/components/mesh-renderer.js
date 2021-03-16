import { Component, Types } from 'ecsy';

export class MeshRenderer extends Component {
  static schema = {
    scene: { type: Types.Ref }
  };
}
