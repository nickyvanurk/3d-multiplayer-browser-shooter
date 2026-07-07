import { Vector3, Euler, Ray } from 'three';
import { Entity } from '../entity.js';
import { InputCommand } from '../input.js';
import { Bullet } from './bullet.js';
import Types from '../../types.js';

export const RESPAWN_DELAY = 3000;

export class Ship extends Entity {
  constructor(opts = {}) {
    super({ ...opts, type: Types.Entities.SPACESHIP });
    this.acceleration = 3;
    this.angularAcceleration = new Euler(6, 12, 2);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.5;
    this.angularDamping = 0.99;
    this.weight = 1;
    this.kinematic = false;
    this.health = 100;
    this.aim = new Ray();
    this.aimDistance = 0;
    this.weapons = [];
    this.firingPrimary = false;
    this.controller = null;
    this.respawn = true;
    this.randomSpawn = true;
    this.alive = true;
    this.respawnTimer = 0;
  }

  applyInput(input, dt) {
    const {
      forward, backward,
      rollLeft, rollRight,
      strafeLeft, strafeRight, strafeUp, strafeDown,
      boost, weaponPrimary, aim
    } = input;

    const acceleration = boost ? this.acceleration*2 : this.acceleration;

    const movement = {
      x: strafeLeft ? 1 : strafeRight ? -1 : 0,
      y: strafeDown ? -1 : strafeUp ? 1 : 0,
      z: forward ? 1 : backward ? -1 : 0,
      roll: rollLeft ? 1 : rollRight ? -1 : 0,
      yaw: aim ? aim.mouse.x : 0,
      pitch: aim ? -aim.mouse.y : 0
    };

    this.velocity.x = acceleration*dt * movement.x;
    this.velocity.y = acceleration*dt * movement.y;
    this.velocity.z = acceleration*dt * movement.z;

    this.angularVelocity.x = this.angularAcceleration.x*dt * movement.pitch;
    this.angularVelocity.y = this.angularAcceleration.y*dt * -movement.yaw;
    this.angularVelocity.z += this.angularAcceleration.z*dt * -movement.roll;
    this.angularVelocity.z *= Math.pow(this.angularDamping, dt);

    if (Math.abs(this.angularVelocity.z) < 0.000001) {
      this.angularVelocity.z = 0;
    }

    if (aim) {
      const origin = aim.origin;
      const dir = aim.direction;

      this.aim.origin.set(origin.x, origin.y, origin.z);
      this.aim.direction.set(dir.x, dir.y, dir.z);
      this.aimDistance = aim.distance;
    }

    this.firingPrimary = !!weaponPrimary;
  }

  update(dt, world, time) {
    if (!this.alive) {return;}

    const input = this.controller?.lastInput ?? InputCommand.empty();
    this.applyInput(input, dt);

    for (const weapon of this.weapons) {
      weapon.tryFire(time, (position, rotation, damage) => {
        const bullet = world.spawn(new Bullet({ transform: { position, rotation }, damage }));
        bullet.owner = this;
        return bullet;
      });
    }
  }
}
