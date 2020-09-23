import { Component, Types } from 'ecsy';

export class Connection extends Component {
  static schema = {
    value: { type: Types.Ref }
  };
}

