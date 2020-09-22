import { Component, Types } from 'ecsy';

export class Connection extends Component {
  static schema = {
    id: { type: Types.String },
    ws: { type: Types.Ref }
  };
}

