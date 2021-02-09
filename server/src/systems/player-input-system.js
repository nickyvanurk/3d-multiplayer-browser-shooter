import { System } from 'ecsy';
import { Ray } from 'three';

import { Connection } from '../../../shared/components/connection';
import { Input } from '../../../shared/components/input';
import { RigidBody } from '../components/rigidbody';
import { Weapons } from '../components/weapons';
import { Active } from '../components/active';
import { Aim } from '../components/aim';

export class PlayerInputSystem extends System {
  static queries = {
    players: {
      components: [Connection, Input, RigidBody]
    }
  };

  init() {
    this.aim = new Ray();
  }

  execute(delta) {
    this.queries.players.results.forEach((entity) => {
      const {
        forward, backward,
        rollLeft, rollRight,
        strafeLeft, strafeRight, strafeUp, strafeDown,
        boost, weaponPrimary, aim
      } = entity.getComponent(Input);
      const rigidBody = entity.getMutableComponent(RigidBody);

      const acceleration = boost ? rigidBody.acceleration*2 : rigidBody.acceleration;

      const movement = {
        x: strafeLeft ? -1 : strafeRight ? 1 : 0,
        y: strafeDown ? -1 : strafeUp ? 1 : 0,
        z: forward ? -1 : backward ? 1 : 0,
        roll: rollLeft ? -1 : rollRight ? 1 : 0,
        yaw: aim.mouse.x,
        pitch: aim.mouse.y
      };

      rigidBody.velocity.x = acceleration*delta * movement.x;
      rigidBody.velocity.y = acceleration*delta * movement.y;
      rigidBody.velocity.z = acceleration*delta * movement.z;

      rigidBody.angularVelocity.x = rigidBody.angularAcceleration.x*delta * movement.pitch
      rigidBody.angularVelocity.y = rigidBody.angularAcceleration.y*delta * -movement.yaw;
      rigidBody.angularVelocity.z += rigidBody.angularAcceleration.z*delta * -movement.roll;
      rigidBody.angularVelocity.z *= Math.pow(rigidBody.angularDamping, delta);

      if (Math.abs(rigidBody.angularVelocity.z) < 0.000001) {
        rigidBody.angularVelocity.z = 0;
      }

      if (entity.hasComponent(Aim)) {
        const ray = entity.getMutableComponent(Aim);
        let origin = aim.origin;
        let dir = aim.direction;
        ray.position.set(origin.x, origin.y, origin.z);
        ray.direction.set(dir.x, dir.y, dir.z);
      }

      if (entity.hasComponent(Weapons)) {
        const weapons = entity.getComponent(Weapons).primary;

        weapons.forEach((weaponEntity) => {
          if (weaponPrimary) {
            if (!weaponEntity.hasComponent(Active)) {
              weaponEntity.addComponent(Active);
            }
          } else {
            if (weaponEntity.hasComponent(Active)) {
              weaponEntity.removeComponent(Active);
            }
          }
        });
      }
    });
  }
}
