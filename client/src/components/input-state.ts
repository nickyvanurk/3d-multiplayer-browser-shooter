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
    this.mousePosition = {x: 0, y: 0};
  }
}
