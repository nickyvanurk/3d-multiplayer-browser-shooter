import * as THREE from 'three';
import {System, Not, Entity} from 'ecsy';

import {Rotating} from '../components/rotating';
import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Object3d} from '../components/object3d';
import {Camera} from '../components/camera';
import {SphereCollider} from '../components/sphere-collider';
import {Colliding} from '../components/colliding';
import {CollisionStart} from '../components/collision-start';
import {CollisionStop} from '../components/collision-stop';

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
    },
    collisions: {
      components: [Colliding],
      listen: {
        added: true
      }
    },
    collisionsStart: {
      components: [CollisionStart],
      listen: {
        added: true
      }
    },
    collisionsStop: {
      components: [CollisionStop],
      listen: {
        added: true
      }
    }
  };

  private frame: number;
  private fixedUpdate: Function;

  init() {
    this.frame = 0;
    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
  }

  execute(delta: number) {
    const nextFrameRatio = this.fixedUpdate(delta);

    this.queries.collisionsStart.results.forEach((collisionStartEntity: Entity) => {
      collisionStartEntity.removeComponent(CollisionStart);
    });

    this.queries.collisionsStop.results.forEach((collisionStopEntity: Entity) => {
      collisionStopEntity.removeComponent(CollisionStop);
    });

    this.queries.collisions.results.forEach((collisionEntity: Entity) => {
      const component = collisionEntity.getComponent(Colliding);

      if (component.collidingFrame !== this.frame) {
        collisionEntity.removeComponent(Colliding);
        collisionEntity.addComponent(CollisionStop);
        return;
      }
    });

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
    this.frame++;

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

    sphereColliders.forEach((entity: Entity) => {
      const transform = entity.getMutableComponent(Transform);
      const sphereCollider = entity.getComponent(SphereCollider);
      const nearbyEntities = octree.query(transform.position, sphereCollider.radius * 2);

      const transform1 = entity.getMutableComponent(Transform);

      nearbyEntities.forEach((other: Entity) => {
        if (entity === other) {
          return;
        }

        const transform2 = other.getMutableComponent(Transform);

        const sphereCollider1 = entity.getComponent(SphereCollider);
        const sphereCollider2 = other.getComponent(SphereCollider);

        const sphere1 = new THREE.Sphere(transform1.position, sphereCollider1.radius);
        const sphere2 = new THREE.Sphere(transform2.position, sphereCollider2.radius);

        if (sphere1.intersectsSphere(sphere2)) {
          if (!entity.hasComponent(Colliding)) {
            entity.addComponent(Colliding, {collisionFrame: this.frame});
            entity.addComponent(CollisionStart);
          }

          if (!other.hasComponent(Colliding)) {
            other.addComponent(Colliding, {collisionFrame: this.frame});
            other.addComponent(CollisionStart);
          }

          let component = entity.getMutableComponent(Colliding);

          if (!component.collidingWidth.includes(other)) {
            component.collidingWidth.push(other);
          }

          component = other.getMutableComponent(Colliding);

          if (!component.collidingWidth.includes(entity)) {
            component.collidingWidth.push(entity);
          }

          const n = new THREE.Vector3();
          n.copy(sphere2.center).sub(sphere1.center);
          n.normalize();

          const physics1 = entity.getMutableComponent(Physics);
          const physics2 = other.getMutableComponent(Physics);

          const p =  physics1.velocity.dot(n) - physics2.velocity.dot(n);

          physics1.velocity.sub(new THREE.Vector3().copy(n).multiplyScalar(p));
          physics2.velocity.add(new THREE.Vector3().copy(n).multiplyScalar(p));

          const overlap = sphere1.radius + sphere2.radius - sphere1.center.distanceTo(sphere2.center);

          transform1.position.sub(new THREE.Vector3().copy(n).multiplyScalar(overlap / 2));
          transform2.position.add(new THREE.Vector3().copy(n).multiplyScalar(overlap / 2));
        }
      });
    });
  }
}
