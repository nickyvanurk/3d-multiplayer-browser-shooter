import { Component, Types } from 'ecsy';

export class GltfLoader extends Component {
  static schema = {
    value: { type: Types.Ref }
  };
}
