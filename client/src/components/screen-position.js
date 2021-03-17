import { Component, Types } from 'ecsy';

export class ScreenPosition extends Component {
  static schema = {
    x: { type: Types.Number },
    y: { type: Types.Number }
  };
}
