import { Component, Types } from 'ecsy';

export class SufferDamage extends Component {
  static schema = {
    amount: { type: Types.Number }
  };
}
