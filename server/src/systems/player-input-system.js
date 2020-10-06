import { System } from 'ecsy';

import { Connection } from '../../../shared/components/connection';
import { PlayerInputState } from '../../../shared/components/player-input-state';
import { RigidBody } from '../components/rigidbody';

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
        boost
      } = entity.getComponent(PlayerInputState);
      const rigidBody = entity.getMutableComponent(RigidBody);

      const acceleration = boost ? rigidBody.acceleration*2 : rigidBody.acceleration;

      rigidBody.velocity.x = acceleration*delta * movementX;
      rigidBody.velocity.y = acceleration*delta * movementY;
      rigidBody.velocity.z = acceleration*delta * movementZ;

      rigidBody.angularVelocity.x = rigidBody.angularAcceleration.x*delta * pitch;
      rigidBody.angularVelocity.y = rigidBody.angularAcceleration.y*delta * -yaw;
      rigidBody.angularVelocity.z += rigidBody.angularAcceleration.z*delta * -roll;
      rigidBody.angularVelocity.z *= Math.pow(rigidBody.angularDamping, delta/1000);

      if (Math.abs(rigidBody.angularVelocity.z) < 0.000001) {
        rigidBody.angularVelocity.z = 0;
      }
    });
  }
}
