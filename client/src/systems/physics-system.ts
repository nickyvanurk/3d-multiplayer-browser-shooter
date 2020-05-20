import * as THREE from 'three';
import {System} from 'ecsy';
import {Rotating} from '../components/rotating';
import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Object3d} from '../components/object3d';
import {Camera} from '../components/camera';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

export class PhysicsSystem extends System {
  static queries: any = {
    transforms: {
      components: [Transform]
    },
    rotating: {
      components: [Transform, Rotating]
    },
    players: {
      components: [PlayerInputState, Transform, Physics]
    },
    camera: {
      components: [Object3d, Camera]
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
      transform.renderPosition = new THREE.Vector3().copy(transform.position)
                                                    .multiplyScalar(nextFrameRatio)
                                                    .add(new THREE.Vector3()
                                                      .copy(transform.previousPosition)
                                                      .multiplyScalar(1 - nextFrameRatio));
      transform.renderRotation = new THREE.Quaternion().copy(transform.previousRotation)
                                                       .slerp(transform.rotation, nextFrameRatio);
    });
  }

  handleFixedUpdate(delta: number) {
    this.queries.transforms.results.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);
      transform.previousPosition.copy(transform.position);
      transform.previousRotation.copy(transform.rotation);
    });

    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const transform = entity.getMutableComponent(Transform);
      const physics = entity.getMutableComponent(Physics);

      physics.velocity.x += physics.acceleration*delta * input.movementX;
      physics.velocity.y += physics.acceleration*delta * input.movementY;
      physics.velocity.z += physics.acceleration*delta * input.movementZ;

      physics.angularVelocity.x = 0.0000625*delta * input.pitch;
      physics.angularVelocity.y = 0.0000625*delta * -input.yaw;
      physics.angularVelocity.z += physics.angularAcceleration*delta * input.roll;

      physics.velocity.x *= Math.pow(physics.damping, delta/1000);
      physics.velocity.y *= Math.pow(physics.damping, delta/1000);
      physics.velocity.z *= Math.pow(physics.damping, delta/1000);
      physics.angularVelocity.z *= Math.pow(physics.angularDamping, delta/1000);

      const temp = new THREE.Object3D();
      temp.quaternion.copy(transform.rotation);
      temp.position.copy(transform.position);

      temp.translateX(physics.velocity.x*delta);
      temp.translateY(physics.velocity.y*delta);
      temp.translateZ(physics.velocity.z*delta);
      transform.position.copy(temp.position);

      const q = new THREE.Quaternion(
        physics.angularVelocity.x*delta,
        physics.angularVelocity.y*delta,
        physics.angularVelocity.z*delta,
        1
      ).normalize();
      temp.quaternion.multiply(q);
      transform.rotation.copy(temp.quaternion);

      this.queries.camera.results.forEach((entity: any) => {
        const obj = new THREE.Object3D();
        obj.position.copy(temp.position);
        obj.quaternion.copy(temp.quaternion);
        obj.translateY(1);
        obj.translateZ(-4);
        obj.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'XYZ')).normalize());

        const transform = entity.getMutableComponent(Transform);
        transform.position.lerp(obj.position, 1 - Math.exp(-20 * (delta/1000)));
        transform.rotation.slerp(obj.quaternion,  1 - Math.exp(-20 * (delta/1000)));
      });
    });

    this.queries.rotating.results.forEach((entity: any) => {
      let rotation = entity.getMutableComponent(Transform).rotation;
      rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.001*delta));
      rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.001*delta));
    });
  }
}
