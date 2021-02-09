import { Component, Types } from 'ecsy';

export class Input extends Component {
  static schema = {
    forward: { type: Types.Boolean },
    backward: { type: Types.Boolean },
    rollLeft: { type: Types.Boolean },
    rollRight: { type: Types.Boolean },
    strafeLeft: { type: Types.Boolean },
    strafeRight: { type: Types.Boolean },
    strafeUp: { type: Types.Boolean },
    strafeDown: { type: Types.Boolean },
    boost: { type: Types.Boolean },
    weaponPrimary: { type: Types.Boolean },
    aim: { type: Types.Ref }
  };
}
