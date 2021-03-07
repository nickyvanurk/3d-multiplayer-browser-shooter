import { Component, Types } from 'ecsy';

export class ParticleEffect extends Component {
  static schema = {
    type: { type: Types.Number },
    opacity: { type: Types.Number, default: 1 },
    particles: { type: Types.Array },
  };

  static Types = {
    Explosion: 0
  };
}
