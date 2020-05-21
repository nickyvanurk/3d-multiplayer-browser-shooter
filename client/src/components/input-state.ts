import {Component} from 'ecsy';

export class InputState extends Component {
  keysDown: any;
  mouseButtonsDown: any;
  mousePosition: any;

  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.keysDown = [];
    this.mouseButtonsDown = [];
    this.mousePosition = {x: window.innerWidth/2, y: window.innerHeight/2};
  }
}
