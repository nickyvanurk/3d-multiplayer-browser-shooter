import { Component, Types } from 'ecsy';

export class PlayerController extends Component {
  static schema = {
    forward: { type: Types.String },
    backward: { type: Types.String },
    rollLeft: { type: Types.String },
    rollRight: { type: Types.String },
    strafeLeft: { type: Types.String },
    strafeRight: { type: Types.String },
    strafeUp: { type: Types.String },
    strafeDown: { type: Types.String },
    boost: { type: Types.String },
    weaponPrimary: { type: Types.Boolean }
  };
}

