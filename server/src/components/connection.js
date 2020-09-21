import { Component, Types } from 'ecsy';

export class Connection extends Component {}

Connection.schema = {
  id: { type: Types.String },
  connection: { type: Types.Ref }
}
