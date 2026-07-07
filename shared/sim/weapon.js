import { Vector3, Quaternion, Ray, Matrix4 } from 'three';

export class Weapon {
  constructor({ offset, delay = 0, fireInterval = 100, parent } = {}) {
    this.offset = offset ? offset.clone() : new Vector3();
    this.delay = delay;
    this.fireInterval = fireInterval;
    this.lastFiredTimestamp = null;
    this.firing = false;
    this.parent = parent;
    this._held = false;
  }

  tryFire(time, spawnBullet) {
    const held = this.parent.firingPrimary;

    // Reactive-query transitions: activation (Active added) resets the timer;
    // deactivation (Active removed) drops out of the firing state.
    if (held && !this._held) {this.lastFiredTimestamp = time;}
    if (!held && this._held) {this.firing = false;}
    this._held = held;

    if (!held) {return;}

    if (!this.firing && (this.lastFiredTimestamp + this.delay < time)) {
      this.lastFiredTimestamp = time;
      this.firing = true;
    }

    if (this.firing && (this.lastFiredTimestamp + this.fireInterval < time)) {
      this.lastFiredTimestamp = time;
      const { position, rotation } = getWeaponTransform(this);
      const damage = 5;
      spawnBullet(position, rotation, damage);
    }
  }
}

export function getWeaponTransform(weapon) {
  const transform = weapon.parent.transform;
  const position = new Vector3()
    .copy(weapon.offset)
    .applyQuaternion(transform.rotation)
    .add(transform.position);
  let rotation = transform.rotation;

  if (weapon.parent.aim) {
    const aim = weapon.parent.aim;

    const target = new Vector3();
    new Ray(aim.origin, aim.direction).at(weapon.parent.aimDistance, target);

    const direction = new Vector3();
    direction.subVectors(target, position).normalize();

    const mx = new Matrix4().lookAt(direction, new Vector3(0,0,0), new Vector3(0,1,0));
    const qt = new Quaternion().setFromRotationMatrix(mx);
    rotation = qt;
  }

  return { position, rotation };
}
