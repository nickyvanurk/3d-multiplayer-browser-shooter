import { Component, Types } from 'ecsy';

export class Range extends Component {
  static schema = {
    radius: { type: Types.Number },
    inRange: { type: Types.Array },
  };
}
