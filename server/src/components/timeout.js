import { Component, Types } from 'ecsy';

export class Timeout extends Component {
  static schema = {
    timer: { type: Types.Number },
    addComponents: { type: Types.Array },
    removeComponents: { type: Types.Array }
  };
}
