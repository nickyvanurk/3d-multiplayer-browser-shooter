import { Vector3, Quaternion } from 'three';

export interface TransformInit {
  position?: Vector3;
  rotation?: Quaternion;
  scale?: number;
}

export class Transform {
  position: Vector3;
  rotation: Quaternion;
  scale: number;
  prevPosition: Vector3;
  prevRotation: Quaternion;
  // Client render-only (Fiedler visual smoothing): the offset between the drawn
  // pose and the authoritative pose, added at render and decayed toward zero so
  // server corrections glide instead of popping. Server never touches these.
  errorPosition: Vector3;
  errorRotation: Quaternion;

  constructor({ position, rotation, scale }: TransformInit = {}) {
    this.position = position ? position.clone() : new Vector3();
    this.rotation = rotation ? rotation.clone() : new Quaternion();
    this.scale = scale ?? 1;
    this.prevPosition = this.position.clone();
    this.prevRotation = this.rotation.clone();
    this.errorPosition = new Vector3();
    this.errorRotation = new Quaternion();
  }

  copy(other: Transform): this {
    this.position.copy(other.position);
    this.rotation.copy(other.rotation);
    this.scale = other.scale;
    return this;
  }
}
