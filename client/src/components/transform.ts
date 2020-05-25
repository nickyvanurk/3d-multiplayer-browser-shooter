import {Component} from 'ecsy';
import {Vector3, Quaternion} from 'three';

export class Transform extends Component {
  previousPosition: Vector3;
  previousRotation: Quaternion;

  position: Vector3;
  rotation: Quaternion;

  renderPosition: Vector3;
  renderRotation: Quaternion;

  constructor() {
    super();

    this.previousPosition = new Vector3(0, 0, 0);
    this.previousRotation = new Quaternion();

    this.position = new Vector3(0, 0, 0);
    this.rotation = new Quaternion();

    this.renderPosition = new Vector3(0, 0, 0);
    this.renderRotation = new Quaternion();
  }

  copy(src: Transform) {
    this.position.copy(src.position);
    this.rotation.copy(src.rotation);
  }

  reset() {
    this.previousPosition.set(0, 0, 0);
    this.previousRotation.set(0, 0, 0, 0);

    this.position.set(0, 0, 0);
    this.rotation.set(0, 0, 0, 0);

    this.renderPosition.set(0, 0, 0);
    this.renderRotation.set(0, 0, 0, 0);
  }
}
