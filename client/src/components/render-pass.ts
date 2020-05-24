import {Component, Entity} from 'ecsy';
import {Scene as Scene$1} from 'three';

export class RenderPass extends Component {
  public scene: Scene$1;

  constructor() {
    super();

    this.reset();
  }

  copy(src: RenderPass) {
    this.scene = src.scene;
  }

  reset() {
    this.scene = null;
  }
}
