import { Vector3, Euler } from 'three';
import { Entity } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import Types from '../../types.ts';

export interface AsteroidInit {
  id?: number;
  transform?: TransformInit;
  scale?: number;
}

export class Asteroid extends Entity {
  acceleration: number;
  angularAcceleration: Euler;

  constructor({ id, transform, scale = 1 }: AsteroidInit = {}) {
    super({
      id,
      transform: { ...transform, scale },
      type: Types.Entities.ASTEROID,
    });
    this.acceleration = 0;
    this.angularAcceleration = new Euler(0, 0, 0);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.001;
    this.angularDamping = 0.1;
    // Static world geometry: fixed rigid bodies (weight 0) that never move.
    // Dynamic/mineable behaviour will be layered on later.
    this.weight = 0;
    this.kinematic = false;
  }
}
