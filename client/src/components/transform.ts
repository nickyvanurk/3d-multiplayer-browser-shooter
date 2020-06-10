import {Component} from 'ecsy';
import {Vector3, Quaternion} from 'three';

export class Transform extends Component {
  previousPosition: Vector3;
  previousRotation: Quaternion;

  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;

  renderPosition: Vector3;
  renderRotation: Quaternion;

  constructor() {
    super();

    this.previousPosition = new Vector3(0, 0, 0);
    this.previousRotation = new Quaternion();

    this.position = new Vector3(0, 0, 0);
    this.rotation = new Quaternion();
    this.scale = new Vector3(1, 1, 1);

    this.renderPosition = new Vector3(0, 0, 0);
    this.renderRotation = new Quaternion();
  }

  copy(src: Transform) {
    if (src.position) {
      this.position.copy(src.position);
    }

    if (src.rotation) {
      this.rotation.copy(src.rotation);
    }

    if (src.scale) {
      this.scale.copy(src.scale);
    }
  }

  reset() {
    this.previousPosition.set(0, 0, 0);
    this.previousRotation.set(0, 0, 0, 0);

    this.position.set(0, 0, 0);
    this.rotation.set(0, 0, 0, 0);
    this.scale.set(1, 1, 1);

    this.renderPosition.set(0, 0, 0);
    this.renderRotation.set(0, 0, 0, 0);
  }
}
