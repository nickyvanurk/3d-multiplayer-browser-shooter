import { System } from 'ecsy';
import { Quaternion } from 'three';

import { Transform } from '../components/transform';
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
      transform.rotation.multiply(new Quaternion(
        rigidBody.angularVelocity.x*delta,
        rigidBody.angularVelocity.y*delta,
        rigidBody.angularVelocity.z*delta,
        1
      ).normalize());
    });
  }
}
