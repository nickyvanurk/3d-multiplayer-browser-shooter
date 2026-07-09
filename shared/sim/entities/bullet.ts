import { Vector3, Euler } from 'three';
import { Entity } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import Types from '../../types.ts';

// Muzzle speed of a bullet along its local +Z, in world units per millisecond
// (integrateBullets/sweepProjectiles multiply by the ms timestep). The lead
// indicator reads this to solve the firing intercept; ×1000 gives units/second.
export const DEFAULT_BULLET_SPEED = 1.5;

// How long a bullet lives before it despawns (ms). Speed × timer bounds a shot's
// reach; the lead indicator hides once the intercept lands past this lifetime.
export const DEFAULT_BULLET_TIMER = 2000;

export interface BulletInit {
  id?: number;
  transform?: TransformInit;
  damage?: number;
  speed?: number;
  timer?: number;
}

export class Bullet extends Entity {
  acceleration: number;
  angularAcceleration: Euler;
  damage: number | undefined;
  timeoutMs: number;
  ageMs: number;
  destroyOnCollision: boolean;
  owner: Entity | null;

  constructor({
    id,
    transform,
    damage,
    speed = DEFAULT_BULLET_SPEED,
    timer = DEFAULT_BULLET_TIMER,
  }: BulletInit = {}) {
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

  update(dt: number): void {
    this.ageMs += dt;
    if (this.ageMs > this.timeoutMs) {
      this.markDestroyed();
    }
  }
}
