// shared/sim/transform.js
import { Vector3, Quaternion } from 'three';

export class Transform {
  constructor({ position, rotation, scale } = {}) {
    this.position = position ? position.clone() : new Vector3();
    this.rotation = rotation ? rotation.clone() : new Quaternion();
    this.scale = scale ?? 1;
    // Client-only interpolation state (server never reads these).
    this.prevPosition = this.position.clone();
    this.prevRotation = this.rotation.clone();
  }

  copy(other) {
    this.position.copy(other.position);
    this.rotation.copy(other.rotation);
    this.scale = other.scale;
    return this;
  }
}
