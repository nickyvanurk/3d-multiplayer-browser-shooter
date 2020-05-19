import * as THREE from 'three';
import {System} from 'ecsy';
import {Rotating} from '../components/rotating';
import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {NextFrameNormal} from '../components/next-frame-normal';
import {Object3d} from '../components/object3d';
import {Camera} from '../components/camera';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

export class PhysicsSystem extends System {
  static queries: any = {
    rotating: {
      components: [Transform, Rotating]
    },
    players: {
      components: [PlayerInputState, Transform, Physics]
    },
    nextFrameNormal: {
      components: [NextFrameNormal]
    },
    camera: {
      components: [Object3d, Camera]
    }
  };

  private fixedUpdate: Function;

  init() {
    this.world.createEntity().addComponent(NextFrameNormal);

    const timestep = 1000/60;
    this.fixedUpdate = createFixedTimestep(timestep, this.handleFixedUpdate.bind(this));
  }

  execute(delta: number) {
    const nextFrameNormal = this.fixedUpdate(delta);

    this.queries.nextFrameNormal.results.forEach((entity: any) => {
      const _nextFrameNormal = entity.getMutableComponent(NextFrameNormal);
      _nextFrameNormal.value = nextFrameNormal;
    });
  }

  handleFixedUpdate(delta: number) {
    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const transform = entity.getMutableComponent(Transform);
      const physics = entity.getMutableComponent(Physics);

      const temp = new THREE.Object3D();
      temp.rotation.setFromVector3(transform.rotation);
      temp.position.copy(transform.position);

      physics.velocity.x += physics.acceleration*delta * input.movementX;
      physics.velocity.y += physics.acceleration*delta * input.movementY;
      physics.velocity.z += physics.acceleration*delta * input.movementZ;

      transform.translation.x = physics.velocity.x*delta;
      transform.translation.y = physics.velocity.y*delta;
      transform.translation.z = physics.velocity.z*delta;

      physics.velocity.x *= Math.pow(physics.damping, delta/1000);
      physics.velocity.y *= Math.pow(physics.damping, delta/1000);
      physics.velocity.z *= Math.pow(physics.damping, delta/1000);

      temp.translateX(transform.translation.x);
      temp.translateY(transform.translation.y);
      temp.translateZ(transform.translation.z);
      transform.position.copy(temp.position);

      const q = new THREE.Quaternion(
        0.001*delta * input.pitch,
        0.001*delta * -input.yaw,
        0, //0.001*delta * input.roll,
        1
      ).normalize();
      temp.quaternion.multiply(q);
      temp.rotation.setFromQuaternion(temp.quaternion, temp.rotation.order);
      transform.rotation = temp.rotation.toVector3();

      this.queries.camera.results.forEach((entity: any) => {
        const mesh = entity.getMutableComponent(Object3d).value;

        const obj = new THREE.Object3D();
        obj.position.copy(temp.position);
        obj.quaternion.copy(temp.quaternion);
        obj.translateY(1);
        obj.translateZ(-4);
        mesh.position.lerp(obj.position, 1 - Math.exp(-20 * (delta/1000)));
        obj.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'XYZ')));
        mesh.quaternion.slerp(obj.quaternion,  1 - Math.exp(-20 * (delta/1000)));
      });
    });

    this.queries.rotating.results.forEach((entity: any) => {
      const rotation = entity.getMutableComponent(Transform).rotation;

      rotation.x += 0.001*delta;
      rotation.y += 0.001*delta;
    });
  }
}
