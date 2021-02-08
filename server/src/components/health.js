import { Component, Types } from 'ecsy';

export class Health extends Component {
  static schema = {
    value: { type: Types.Number, default: 100 },
  };
}
