import * as THREE from 'three';
import {System, Not} from 'ecsy';
import {Rotating} from '../components/rotating';
import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Object3d} from '../components/object3d';
import {Camera} from '../components/camera';
import {SphereCollider} from '../components/sphere-collider';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

import {BoundingBox, Octree} from '../utils/octree';

export class PhysicsSystem extends System {
  static queries: any = {
    transforms: {
      components: [Transform]
    },
    rotating: {
      components: [Transform, Rotating]
    },
    players: {
      components: [PlayerInputState, Transform, Physics],
      listen: {
        added: true
      }
    },
    others: {
      components: [Transform, Physics, Not(PlayerInputState)]
    },
    camera: {
      components: [Object3d, Camera]
    },
    sphereColliders: {
      components: [Object3d, Transform, SphereCollider],
      listen: {
        added: true
      }
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

    this.queries.players.added.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);

      this.queries.camera.results.forEach((entity: any) => {
        const cameraTransform = entity.getMutableComponent(Transform);
        cameraTransform.rotation.copy(transform.rotation);
        cameraTransform.rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'XYZ')).normalize());
      });
    });
  }

  handleFixedUpdate(delta: number) {
    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const transform = entity.getMutableComponent(Transform);
      const physics = entity.getMutableComponent(Physics);

      physics.angularVelocity.x = 0.0000625*delta * input.pitch;
      physics.angularVelocity.y = 0.0000625*delta * input.yaw;
      physics.angularVelocity.z += physics.angularAcceleration*delta * input.roll;

      physics.angularVelocity.z *= Math.pow(physics.angularDamping, delta/1000);

      const q = new THREE.Quaternion(
        physics.angularVelocity.x*delta,
        physics.angularVelocity.y*delta,
        physics.angularVelocity.z*delta,
      1
      ).normalize();
      transform.rotation.multiply(q);

      let directionX = new THREE.Vector3(1, 0, 0).applyQuaternion(transform.rotation).normalize();
      let directionY = new THREE.Vector3(0, 1, 0).applyQuaternion(transform.rotation).normalize();
      let directionZ = new THREE.Vector3(0, 0, 1).applyQuaternion(transform.rotation).normalize();

      physics.velocity.add(directionZ.multiplyScalar(physics.acceleration * delta * input.movementZ));
      physics.velocity.add(directionX.multiplyScalar(physics.acceleration * delta * input.movementX));
      physics.velocity.add(directionY.multiplyScalar(physics.acceleration * delta * input.movementY));

      transform.position.x += physics.velocity.x*delta;
      transform.position.y += physics.velocity.y*delta;
      transform.position.z += physics.velocity.z*delta;

      physics.velocity.x *= Math.pow(physics.damping, delta/1000);
      physics.velocity.y *= Math.pow(physics.damping, delta/1000);
      physics.velocity.z *= Math.pow(physics.damping, delta/1000);

      this.queries.camera.results.forEach((entity: any) => {
        const obj = new THREE.Object3D();
        obj.position.copy(transform.position);
        obj.quaternion.copy(transform.rotation);
        obj.translateY(1);
        obj.translateZ(-4);
        obj.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'XYZ')).normalize());

        const cameraTransform = entity.getMutableComponent(Transform);
        cameraTransform.position.lerp(obj.position, 1 - Math.exp(-10 * (delta/1000)));
        cameraTransform.rotation.slerp(obj.quaternion,  1 - Math.exp(-10 * (delta/1000)));
      });
    });

    this.queries.others.results.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);
      const physics = entity.getMutableComponent(Physics);

      transform.position.x += physics.velocity.x*delta;
      transform.position.y += physics.velocity.y*delta;
      transform.position.z += physics.velocity.z*delta;

      physics.velocity.x *= Math.pow(physics.damping*2, delta/1000);
      physics.velocity.y *= Math.pow(physics.damping*2, delta/1000);
      physics.velocity.z *= Math.pow(physics.damping*2, delta/1000);
    });

    this.queries.rotating.results.forEach((entity: any) => {
      let rotation = entity.getMutableComponent(Transform).rotation;
      rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.001*delta));
      rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.001*delta));
    });

    const octree = new Octree(new BoundingBox(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1000, 1000, 1000)
    ), 1);

    const sphereColliders = this.queries.sphereColliders.results;

    sphereColliders.forEach((entity: any) => {
      octree.insert(entity);
    });

    sphereColliders.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);
      const sphereCollider = entity.getComponent(SphereCollider);
      const nearbyEntities = octree.query(transform.position, sphereCollider.radius * 2);

      nearbyEntities.forEach((other: any) => {
        if (entity === other) {
          return;
        }

        const transform1 = entity.getMutableComponent(Transform);
        const transform2 = other.getMutableComponent(Transform);

        const sphere1 = new THREE.Sphere().translate(transform1.position);
        const sphere2 = new THREE.Sphere().translate(transform2.position);

        const sphereCollider1 = entity.getComponent(SphereCollider);
        const sphereCollider2 = other.getComponent(SphereCollider);

        sphere1.radius = sphereCollider1.radius;
        sphere2.radius = sphereCollider2.radius;

        if (sphere1.intersectsSphere(sphere2)) {
          const physics1 = entity.getMutableComponent(Physics);
          const physics2 = other.getMutableComponent(Physics);

          const distance = transform1.position.distanceTo(transform2.position);

          const nx = (transform2.position.x - transform1.position.x) / distance;
          const ny = (transform2.position.y - transform1.position.y) / distance;
          const nz = (transform2.position.z - transform1.position.z) / distance;

          const p = (physics1.velocity.x * nx + physics1.velocity.y * ny + physics1.velocity.z * nz) -
                    (physics2.velocity.x * nx + physics2.velocity.y * ny + physics2.velocity.z * nz);

          physics1.velocity.x -= p * nx;
          physics1.velocity.y -= p * ny;
          physics1.velocity.z -= p * nz;

          physics2.velocity.x += p * nx;
          physics2.velocity.y += p * ny;
          physics2.velocity.z += p * nz;

          const midpointX = (transform1.position.x + transform2.position.x) / 2;
          const midpointY = (transform1.position.y + transform2.position.y) / 2;
          const midpointZ = (transform1.position.z + transform2.position.z) / 2;

          transform1.position.x = midpointX - sphereCollider1.radius * nx;
          transform1.position.y = midpointY - sphereCollider1.radius * ny;
          transform1.position.z = midpointZ - sphereCollider1.radius * nz;

          transform2.position.x = midpointX + sphereCollider2.radius * nx;
          transform2.position.y = midpointY + sphereCollider2.radius * ny;
          transform2.position.z = midpointZ + sphereCollider2.radius * nz;
        }
      });
    });
  }
}
