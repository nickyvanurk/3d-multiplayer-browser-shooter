import {System, Entity} from 'ecsy';
import {Vector3, Quaternion, Euler, Object3D} from 'three';

import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Moving} from '../components/moving';

import createFixedTimestep from '../utils/create-fixed-timestep';

export class PhysicsSystem extends System {
  static queries: any = {
    transforms: {
      components: [Transform]
    },
    players: {
      components: [PlayerInputState, Transform, Physics],
      listen: {
        added: true
      }
    },
    rigidBodies: {
      components: [Physics]
    },
    movingObjects: {
      components: [Moving]
    }
  };

  private fixedUpdate: Function;

  init() {
    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
  }

  execute(delta: number) {
    const nextFrameRatio = this.fixedUpdate(delta);

    this.queries.transforms.results.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);

      transform.renderPosition = new Vector3().copy(transform.position)
                                                    .multiplyScalar(nextFrameRatio)
                                                    .add(new Vector3()
                                                      .copy(transform.previousPosition)
                                                      .multiplyScalar(1 - nextFrameRatio));
      transform.renderRotation = new Quaternion().copy(transform.previousRotation)
                                                       .slerp(transform.rotation, nextFrameRatio);
    });
  }

  handleFixedUpdate(delta: number) {
    this.queries.rigidBodies.results.forEach((entity: Entity) => {
      if (entity.getComponent(Physics).velocity.length() < 0.0001) {
        entity.getMutableComponent(Physics).velocity.setLength(0);
        entity.removeComponent(Moving);
      } else if (!entity.hasComponent(Moving)) {
        entity.addComponent(Moving);
      }
    });

    this.queries.transforms.results.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);

      transform.previousPosition.copy(transform.position);
      transform.previousRotation.copy(transform.rotation);
    });

    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const transform = entity.getMutableComponent(Transform);
      const physics = entity.getMutableComponent(Physics);

      physics.angularVelocity.x = 0.0000625*delta * input.pitch;
      physics.angularVelocity.y = 0.0000625*delta * input.yaw;
      physics.angularVelocity.z += physics.angularAcceleration*delta * input.roll;

      physics.angularVelocity.z *= Math.pow(physics.angularDamping, delta/1000);

      const q = new Quaternion(
        physics.angularVelocity.x*delta,
        physics.angularVelocity.y*delta,
        physics.angularVelocity.z*delta,
      1
      ).normalize();
      transform.rotation.multiply(q);

      let directionX = new Vector3(1, 0, 0).applyQuaternion(transform.rotation).normalize();
      let directionY = new Vector3(0, 1, 0).applyQuaternion(transform.rotation).normalize();
      let directionZ = new Vector3(0, 0, 1).applyQuaternion(transform.rotation).normalize();

      physics.velocity.add(directionZ.multiplyScalar(physics.acceleration * delta * input.movementZ));
      physics.velocity.add(directionX.multiplyScalar(physics.acceleration * delta * input.movementX));
      physics.velocity.add(directionY.multiplyScalar(physics.acceleration * delta * input.movementY));

      transform.position.x += physics.velocity.x*delta;
      transform.position.y += physics.velocity.y*delta;
      transform.position.z += physics.velocity.z*delta;

      physics.velocity.x *= Math.pow(physics.damping, delta/1000);
      physics.velocity.y *= Math.pow(physics.damping, delta/1000);
      physics.velocity.z *= Math.pow(physics.damping, delta/1000);
    });
  }
}
