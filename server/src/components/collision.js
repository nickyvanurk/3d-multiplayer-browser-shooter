import { Component, Types } from 'ecsy';

export class Collision extends Component {
  static schema = {
    collidingWith: { type: Types.Array }
  };
}
