import { System } from 'ecsy';

import { Transform } from '../../../shared/components/transform';
import { RigidBody } from '../components/rigidbody';

export class PhysicsSystem extends System {
  static queries = {
    rigidBodies: {
      components: [Transform, RigidBody]
    }
  };

  execute(delta) {
    this.queries.rigidBodies.results.forEach((entity) => {
      const transform = entity.getMutableComponent(Transform);
      const rigidBody = entity.getMutableComponent(RigidBody);

      transform.position.add(rigidBody.velocity.clone().multiplyScalar(delta));
      rigidBody.velocity.multiplyScalar(Math.pow(rigidBody.damping, delta/1000));

      if (rigidBody.velocity.length() < 0.0001) {
        rigidBody.velocity.setLength(0);
      }
    });
  }
}
