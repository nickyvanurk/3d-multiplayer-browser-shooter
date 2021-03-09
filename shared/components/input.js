import { Component, Types } from 'ecsy';
import { Vector3 } from 'three';

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
    aim: { type: Types.Ref, default: { origin: new Vector3(),
                                       direction: new Vector3(),
                                       distance: 200,
                                       mouse: new Vector3() } }
  };
}
