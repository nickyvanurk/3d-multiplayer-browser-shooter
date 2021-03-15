import { Component, Types } from 'ecsy';

export class Loading extends Component {
  static schema = {
    progress: { type: Types.Number },
  };
}
