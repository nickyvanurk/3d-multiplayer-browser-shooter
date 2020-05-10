import {Component} from 'ecsy';

export class GltfModel extends Component {
  value: any;

  constructor() {
    super();
    this.reset();
  }

  copy(src: GltfModel) {
    this.value = src.value;
  }

  reset() {
    this.value = null;
  }
}
