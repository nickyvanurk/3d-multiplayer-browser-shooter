import { Component, Types } from 'ecsy';

export class NetworkEvent extends Component {
  static schema = {
    type: { type: Types.Ref },
    message: { type: Types.Array }
  };
}

