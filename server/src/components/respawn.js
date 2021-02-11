import { Component, Types } from 'ecsy';

export class Respawn extends Component {
  static schema = {
    timer: { type: Types.Number, default: 3000 }
  };
}
