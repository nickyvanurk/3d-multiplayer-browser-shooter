import { Component, Types } from 'ecsy';

export class Camera extends Component {
  static schema = {
    value: { type: Types.Ref }
  };
}
