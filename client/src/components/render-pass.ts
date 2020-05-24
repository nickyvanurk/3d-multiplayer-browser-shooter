import {Component, Entity} from 'ecsy';

export class RenderPass extends Component {
  public scene: Entity;
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
