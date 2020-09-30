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
        movementZ
      } = entity.getComponent(PlayerInputState);
      const rigidBody = entity.getMutableComponent(RigidBody);

      rigidBody.velocity.x += rigidBody.acceleration * delta * movementX;
      rigidBody.velocity.y += rigidBody.acceleration * delta * movementY;
      rigidBody.velocity.z += rigidBody.acceleration * delta * movementZ;
    });
  }
}
