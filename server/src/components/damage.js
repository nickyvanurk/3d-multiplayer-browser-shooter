import { Component, Types } from 'ecsy';

export class Damage extends Component {
  static schema = {
    value: { type: Types.Number },
  };
}
