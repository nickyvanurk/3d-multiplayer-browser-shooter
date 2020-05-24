import {Component} from 'ecsy';

export class Camera extends Component {
  public fov: number;
  public aspect: number;
  public near: number;
  public far: number;
  public layer: number;
  public handleResize: boolean;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Camera) {
    this.fov = src.fov;
    this.aspect = src.aspect;
    this.near = src.near;
    this.far = src.far;
    this.layer = src.layer;
    this.handleResize = src.handleResize;
  }

  reset() {
    this.fov = 45;
    this.aspect = 1;
    this.near = 0.1;
    this.far = 1000;
    this.layer = 0;
    this.handleResize = true;
  }
}
