import {Component} from 'ecsy';

export class GltfLoader extends Component {
  url: string;
  receiveShadow: boolean;
  castShadow: boolean;
  envMapOverride: any;

  constructor() {
    super();
    this.reset();
  }

  copy(src: GltfLoader) {
    this.url = src.url;
    this.receiveShadow = src.receiveShadow;
    this.castShadow = src.castShadow;
    this.envMapOverride = src.envMapOverride;
  }

  reset() {
    this.url = '';
    this.receiveShadow = false;
    this.castShadow = false;
    this.envMapOverride = null;
  }
}
