import { Component, Types } from 'ecsy';

export class InputState extends Component {
  static schema = {
    keysDown: { type: Types.Array },
    mouseButtonsDown: { type: Types.Array },
    mousePosition: { type: Types.Ref, default: { x: 0, y: 0 } },
  };
}

