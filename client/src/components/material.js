import { Component, Types } from 'ecsy';

export class Material extends Component {
  static schema = {
    value: { type: Types.Ref }
  };
}
