import {Component} from 'ecsy';

export class WebGlRenderer extends Component {
  public width: number;
  public height: number;
  public antialias: boolean;
  public handleResize: boolean;
  public shadowMap: boolean;
  public clearColor: number;

  constructor() {
    super();

    this.reset();
  }

  copy(src: WebGlRenderer) {
    this.width = src.width || this.width;
    this.height = src.height | this.height;
    this.antialias = src.antialias || this.antialias;
    this.handleResize = src.handleResize || this.handleResize;
    this.shadowMap = src.shadowMap || this.shadowMap;
    this.clearColor = src.clearColor || this.clearColor;
  }

  reset() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.antialias = false;
    this.handleResize = true;
    this.shadowMap = false;
    this.clearColor = 0x000000;
  }
}
