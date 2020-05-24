import {Component} from 'ecsy';

export class WebGlRenderer extends Component {
  public width: number;
  public height: number;
  public antialias: boolean;
  public handleResize: boolean;
  public shadowMap: boolean;

  constructor() {
    super();

    this.reset();
  }

  copy(src: WebGlRenderer) {
    this.width = src.width;
    this.height = src.height;
    this.antialias = src.antialias;
    this.handleResize = src.handleResize;
    this.shadowMap = src.shadowMap;
  }

  reset() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.antialias = true;
    this.handleResize = true;
    this.shadowMap = true;
  }
}
