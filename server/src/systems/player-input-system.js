import { System } from 'ecsy';
import { Vector3, Euler } from 'three';

import { Connection } from '../../../shared/components/connection';
import { PlayerInputState } from '../../../shared/components/player-input-state';
import { RigidBody } from '../components/rigidbody';
import { Transform } from '../components/transform';

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
      const transform = entity.getMutableComponent(Transform);

      const rotation = new Euler().setFromVector3(transform.rotation);
      const direction = {
        x: new Vector3(1, 0, 0).applyEuler(rotation).normalize(),
        y: new Vector3(0, 1, 0).applyEuler(rotation).normalize(),
        z: new Vector3(0, 0, 1).applyEuler(rotation).normalize()
      };
      const movement = {
        x: boost ? movementX * 2 : movementX,
        y: boost ? movementY * 2 : movementY,
        z: boost ? movementZ * 2 : movementZ
      };

      rigidBody.velocity.add(direction.x.multiplyScalar(rigidBody.acceleration*delta * movement.x));
      rigidBody.velocity.add(direction.y.multiplyScalar(rigidBody.acceleration*delta * movement.y));
      rigidBody.velocity.add(direction.z.multiplyScalar(rigidBody.acceleration*delta * movement.z));
      
      rigidBody.angularVelocity.x = rigidBody.angularAcceleration.x*delta * pitch;
      rigidBody.angularVelocity.y = rigidBody.angularAcceleration.y*delta * -yaw;
      rigidBody.angularVelocity.z += rigidBody.angularAcceleration.z*delta * -roll;
    });
  }
}
