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

  constructor({ position, rotation, scale }: TransformInit = {}) {
    this.position = position ? position.clone() : new Vector3();
    this.rotation = rotation ? rotation.clone() : new Quaternion();
    this.scale = scale ?? 1;
    this.prevPosition = this.position.clone();
    this.prevRotation = this.rotation.clone();
  }

  copy(other: Transform): this {
    this.position.copy(other.position);
    this.rotation.copy(other.rotation);
    this.scale = other.scale;
    return this;
  }
}
