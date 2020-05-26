import {Component, Entity} from 'ecsy';
import {Raycaster as Raycaster$1, Intersection} from 'three';

export class Raycaster extends Component {
  public value: Raycaster$1;
  public currentEntity: Entity;
  public intersection: Intersection;

  constructor() {
    super();

    this.reset();
  }

  copy(src: Raycaster) {
    this.value = src.value || this.value;
    this.currentEntity = src.currentEntity || this.currentEntity;
    this.intersection = src.intersection || this.intersection;
  }

  reset() {
    this.value = null;
    this.currentEntity = null;
    this.intersection = null;
  }
}
