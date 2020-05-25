import {Component, ComponentConstructor} from 'ecsy';

export class Timeout extends Component {
  public timer: number;
  public addComponents: Array<ComponentConstructor<Component>>;
  public removeComponents: Array<ComponentConstructor<Component>>;

  constructor() {
    super();

    this.addComponents = [];
    this.removeComponents = [];
    this.reset();
  }

  copy(src: Timeout) {
    this.timer = src.timer || this.timer;
    this.addComponents = src.addComponents || this.addComponents;
    this.removeComponents = src.removeComponents || this.removeComponents;
  }

  reset() {
    this.timer = 0;
    this.addComponents.length = 0;
    this.removeComponents.length = 0;
  }
}
