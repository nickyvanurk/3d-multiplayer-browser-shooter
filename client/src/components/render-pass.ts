import {Component, Entity} from 'ecsy';
import {Scene as Scene$1} from 'three';

export class RenderPass extends Component {
  public scene: Scene$1;
  public camera: Entity;

  constructor() {
    super();

    this.reset();
  }

  copy(src: RenderPass) {
    this.scene = src.scene;
    this.camera = src.camera;
  }

  reset() {
    this.scene = null;
    this.camera = null;
  }
}
