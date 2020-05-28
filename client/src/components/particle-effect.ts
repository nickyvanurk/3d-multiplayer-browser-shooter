import {Component} from 'ecsy';

export enum ParticleEffectType {
  Explosion
}

export class ParticleEffect extends Component {
  public type: ParticleEffectType;

  constructor() {
    super();

    this.reset();
  }

  copy(src: ParticleEffect) {
    this.type = src.type;
  }

  reset() {
    this.type = null;
  }
}
