import { System } from 'ecsy';

import { Connection } from '../../../shared/components/connection';
import { PlayerInputState } from '../../../shared/components/player-input-state';
import { RigidBody } from '../components/rigidbody';
import { Weapons } from '../components/weapons';
import { Active } from '../components/active';

export class PlayerInputSystem extends System {
  static queries = {
    players: {
      components: [Connection, PlayerInputState, RigidBody]
    }
  };

  execute(delta) {
    this.queries.players.results.forEach((entity) => {
      const {
        movementX,
        movementY,
        movementZ,
        pitch,
        yaw,
        roll,
        boost,
        weaponPrimary
      } = entity.getComponent(PlayerInputState);
      const rigidBody = entity.getMutableComponent(RigidBody);

      const acceleration = boost ? rigidBody.acceleration*2 : rigidBody.acceleration;

      rigidBody.velocity.x = acceleration*delta * movementX;
      rigidBody.velocity.y = acceleration*delta * movementY;
      rigidBody.velocity.z = acceleration*delta * movementZ;

      rigidBody.angularVelocity.x = rigidBody.angularAcceleration.x*delta * pitch;
      rigidBody.angularVelocity.y = rigidBody.angularAcceleration.y*delta * -yaw;
      rigidBody.angularVelocity.z += rigidBody.angularAcceleration.z*delta * -roll;
      rigidBody.angularVelocity.z *= Math.pow(rigidBody.angularDamping, delta);

      if (Math.abs(rigidBody.angularVelocity.z) < 0.000001) {
        rigidBody.angularVelocity.z = 0;
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
