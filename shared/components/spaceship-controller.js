import { Component, Types } from 'ecsy';

export class SpaceshipController extends Component {
  static schema = {
    player: { type: Types.Ref }
  };

  hasPlayerAttached() {
    return !!this.player;
  }
}
