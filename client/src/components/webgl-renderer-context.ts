import {Component} from 'ecsy';
import {WebGLRenderer} from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';

export class WebGlRendererContext extends Component {
  public renderer: WebGLRenderer;
  public composer: EffectComposer;

  constructor() {
    super();

    this.reset();
  }

  copy(src: WebGlRendererContext) {
    this.renderer = src.renderer;
    this.composer = src.composer;
  }

  reset() {
    this.renderer = null;
    this.composer = null;
  }
}
