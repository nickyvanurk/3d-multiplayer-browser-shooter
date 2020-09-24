import { Component, Types } from 'ecsy';

export class WebGlRenderer extends Component {
  static schema = {
    renderer: { type: Types.Ref },
    composer: { type: Types.Ref },
    scene: { type: Types.Ref },
    camera: { type: Types.Ref }
  };
}

