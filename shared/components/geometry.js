import { Component, Types } from 'ecsy';

export class Geometry extends Component {
  static schema = {
    value: { type: Types.Ref }
  };
}
