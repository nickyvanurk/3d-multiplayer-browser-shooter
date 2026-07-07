import { Vector3, Euler } from 'three';
import { Entity } from '../entity.js';
import Types from '../../types.js';

export class Asteroid extends Entity {
  constructor({ id, transform, scale = 1 } = {}) {
    super({ id, transform: { ...transform, scale }, type: Types.Entities.ASTEROID });
    this.acceleration = 0;
    this.angularAcceleration = new Euler(0, 0, 0);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.001;
    this.angularDamping = 0.1;
    this.weight = scale <= 5 ? 1 : 0;
    this.kinematic = false;
  }
}
