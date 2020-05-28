import {Component} from 'ecsy';
import {ParticleEffectType} from './particle-effect';

export class ParticleEffectOnDestroy extends Component {
  public type: ParticleEffectType;

  constructor() {
    super();

    this.reset();
  }

  copy(src: ParticleEffectOnDestroy) {
    this.type = src.type;
  }

  reset() {
    this.type = null;
  }
}
