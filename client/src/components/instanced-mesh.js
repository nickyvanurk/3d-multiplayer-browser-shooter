import { Component, Types } from 'ecsy';

export class InstancedMesh extends Component {
  static schema = {
    count: { type: Types.Number },
    value: { type: Types.Ref }
  };
}
