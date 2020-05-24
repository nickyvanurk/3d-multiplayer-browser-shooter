import {Component} from 'ecsy';
import {WebGLRenderer} from 'three';

export class WebGlRendererContext extends Component {
  public value: WebGLRenderer;

  constructor() {
    super();

    this.reset();
  }

  copy(src: WebGlRendererContext) {
    this.value = src.value;
  }

  reset() {
    this.value = null;
  }
}
