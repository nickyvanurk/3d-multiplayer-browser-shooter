import { Component, Types } from 'ecsy';

export class InstancedMeshRenderer extends Component {
  static schema = {
    instance: { type: Types.Ref }
  };
}
