import { Vector3, Euler } from 'three';
import { Entity } from '../entity.js';
import Types from '../../types.js';

export class Bullet extends Entity {
  constructor({ id, transform, damage, speed = 0.5, timer = 2000 } = {}) {
    super({ id, transform, type: Types.Entities.BULLET });
    this.velocity = new Vector3(0, 0, speed);
    this.angularVelocity = new Vector3();
    this.acceleration = 0;
    this.angularAcceleration = new Euler(0, 0, 0);
    this.damping = 0;
    this.angularDamping = 0;
    this.kinematic = true;
    this.weight = 1;
    this.damage = damage;
    this.timeoutMs = timer;
    this.ageMs = 0;
    this.destroyOnCollision = true;
    this.owner = null;
  }

  update(dt) {
    this.ageMs += dt;
    if (this.ageMs > this.timeoutMs) {this.markDestroyed();}
  }
}
