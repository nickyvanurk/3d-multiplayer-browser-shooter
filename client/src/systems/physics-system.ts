import {System, Not, Entity} from 'ecsy';
import {Raycaster, Vector3, Scene as Scene$1, Quaternion, Euler, Object3D, Sphere, Mesh} from 'three';
import {BufferGeometryUtils} from 'three/examples/jsm/utils/BufferGeometryUtils';

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
import {Moving} from '../components/moving';
import {Owner} from '../components/owner';
import { MeshCollider } from '../components/mesh-collider';

export class PhysicsSystem extends System {
  static queries: any = {
    transforms: {
      components: [Transform, Object3d]
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
    meshColliders: {
      components: [Transform, MeshCollider]
    },
    sphereColliders: {
      components: [Transform, SphereCollider],
      listen: {
        added: true
      }
    },
    sphereCollidersMoving: {
      components: [Transform, SphereCollider, Moving]
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
    },
    rigidBodies: {
      components: [Physics]
    },
    movingObjects: {
      components: [Moving]
    }
  };

  private frame: number;
  private fixedUpdate: Function;

  init() {
    this.frame = 0;
    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
  }

  execute(delta: number) {
    this.queries.sphereColliders.added.forEach((entity: Entity) => {
      if (!entity.getComponent(SphereCollider).radius && entity.getComponent(Object3d)) {
        const object3d = entity.getComponent(Object3d).value;
        const sphereCollider = entity.getMutableComponent(SphereCollider);

        let combinedGeometry: any = [];

        object3d.traverse((child: Mesh) => {
          if (child.isMesh) {
            combinedGeometry.push(child.geometry.clone().applyMatrix4(object3d.matrix));
          }
        });

        const geometry = BufferGeometryUtils.mergeBufferGeometries(combinedGeometry);
        geometry.computeBoundingSphere();

        sphereCollider.radius = geometry.boundingSphere.radius * Math.max(
          Math.abs(object3d.scale.x),
          Math.abs(object3d.scale.x),
          Math.abs(object3d.scale.y)
        );
      }
    });

    this.queries.collisionsStart.results.forEach((entity: Entity) => {
      entity.removeComponent(CollisionStart);
    });

    const nextFrameRatio = this.fixedUpdate(delta);

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

      transform.renderPosition = new Vector3().copy(transform.position)
                                                    .multiplyScalar(nextFrameRatio)
                                                    .add(new Vector3()
                                                      .copy(transform.previousPosition)
                                                      .multiplyScalar(1 - nextFrameRatio));
      transform.renderRotation = new Quaternion().copy(transform.previousRotation)
                                                       .slerp(transform.rotation, nextFrameRatio);
    });

    this.queries.players.added.forEach((entity: any) => {
      const transform = entity.getMutableComponent(Transform);

      this.queries.camera.results.forEach((entity: any) => {
        const cameraTransform = entity.getMutableComponent(Transform);
        cameraTransform.rotation.copy(transform.rotation);
        cameraTransform.rotation.multiply(new Quaternion().setFromEuler(new Euler(0, Math.PI, 0, 'XYZ')).normalize());
      });
    });
  }

  handleFixedUpdate(delta: number) {
    this.frame++;

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

      this.queries.camera.results.forEach((entity: Entity) => {
        const obj = new Object3D();
        obj.position.copy(transform.position);
        obj.quaternion.copy(transform.rotation);
        obj.translateY(1);
        obj.translateZ(-4);
        obj.quaternion.multiply(new Quaternion().setFromEuler(new Euler(0, Math.PI, 0, 'XYZ')).normalize());

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
      rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.001*delta));
      rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.001*delta));
    });

    const octree = new Octree(new BoundingBox(
      new Vector3(0, 0, 0),
      new Vector3(1000, 1000, 1000)
    ), 1);

    this.queries.meshColliders.results.forEach((entity: Entity) => {
      octree.insert(entity);
    });

    this.queries.sphereColliders.results.forEach((entity: Entity) => {
      octree.insert(entity);
    });

    this.queries.sphereCollidersMoving.results.forEach((entity: Entity) => {
      const transform1 = entity.getMutableComponent(Transform);
      const sphereCollider1 = entity.getComponent(SphereCollider);
      const sphere1 = new Sphere(transform1.position, sphereCollider1.radius);

      const scanRange = 10;
      const nearbyEntities = octree.query(transform1.position, scanRange);

      nearbyEntities.forEach((other: Entity) => {
        if (entity === other) {
          return;
        }

        if (entity.hasComponent(Owner)) {
          if (entity.getComponent(Owner).value === other) {
            return;
          }
        }

        if (other.hasComponent(Owner)) {
          if (other.getComponent(Owner).value === entity) {
            return
          }
        }

        if (entity.hasComponent(Owner) && other.hasComponent(Owner)) {
          if (entity.getComponent(Owner).value === other.getComponent(Owner).value) {
            return;
          }
        }


        if (other.hasComponent(MeshCollider)) {
          const transform2 = other.getMutableComponent(Transform);
          const object3d = other.getComponent(Object3d).value;

          const d = transform1.position.clone().sub(transform1.previousPosition);
          const raycaster = new Raycaster(transform1.previousPosition, d.normalize(), 0, sphere1.radius);

          const intersection = raycaster.intersectObject(object3d, true)[0];


          if (intersection && intersection.distance < sphere1.radius) {
            if (!entity.hasComponent(Colliding)) {
              entity.addComponent(Colliding, {collisionFrame: this.frame});
              entity.addComponent(CollisionStart);
              entity.getMutableComponent(CollisionStart).collidingWidth.push(other);
            }

            let component = entity.getMutableComponent(Colliding);
            if (!component.collidingWidth.includes(other)) {
              component.collidingWidth.push(other);
            }

            if (!sphereCollider1.isTrigger) {
              const n = new Vector3();
              n.copy(intersection.point).sub(sphere1.center);
              n.normalize();

              const physics1 = entity.getMutableComponent(Physics);
              const physics2 = other.getMutableComponent(Physics);

              const p =  physics1.velocity.dot(n) - physics2.velocity.dot(n);

              physics1.velocity.sub(new Vector3().copy(n).multiplyScalar(p));
              physics2.velocity.add(new Vector3().copy(n).multiplyScalar(p));

              const overlap = sphere1.radius - transform1.position.distanceTo(intersection.point);

              transform1.position.sub(new Vector3().copy(n).multiplyScalar(overlap / 2));
              transform2.position.add(new Vector3().copy(n).multiplyScalar(overlap / 2));
            }
          }
        }
        else if (other.hasComponent(SphereCollider)) {
          const transform2 = other.getMutableComponent(Transform);
          const sphereCollider2 = other.getComponent(SphereCollider);

          const sphere2 = new Sphere(transform2.position, sphereCollider2.radius);

          let isRaycastHit = false;

          if (sphereCollider1.raycast) {
            const d = transform1.position.clone().sub(transform1.previousPosition);
            const l = d.length();
            const raycaster = new Raycaster(transform1.previousPosition, d.normalize(), 0, l);
            isRaycastHit = raycaster.ray.intersectSphere(sphere2, new Vector3()) !== null;
          }

          if (sphere1.intersectsSphere(sphere2) || isRaycastHit) {
            if (!entity.hasComponent(Colliding)) {
              entity.addComponent(Colliding, {collisionFrame: this.frame});
              entity.addComponent(CollisionStart);
              entity.getMutableComponent(CollisionStart).collidingWidth.push(other);
            }

            if (!other.hasComponent(Colliding)) {
              other.addComponent(Colliding, {collisionFrame: this.frame});
              other.addComponent(CollisionStart);
              other.getMutableComponent(CollisionStart).collidingWidth.push(entity);
            }

            let component = entity.getMutableComponent(Colliding);

            if (!component.collidingWidth.includes(other)) {
              component.collidingWidth.push(other);
            }

            component = other.getMutableComponent(Colliding);

            if (!component.collidingWidth.includes(entity)) {
              component.collidingWidth.push(entity);
            }

            if (!sphereCollider1.isTrigger && !sphereCollider2.isTrigger) {
              const n = new Vector3();
              n.copy(sphere2.center).sub(sphere1.center);
              n.normalize();

              const physics1 = entity.getMutableComponent(Physics);
              const physics2 = other.getMutableComponent(Physics);

              const p =  physics1.velocity.dot(n) - physics2.velocity.dot(n);

              physics1.velocity.sub(new Vector3().copy(n).multiplyScalar(p));
              physics2.velocity.add(new Vector3().copy(n).multiplyScalar(p));

              const overlap = sphere1.radius + sphere2.radius - sphere1.center.distanceTo(sphere2.center);

              transform1.position.sub(new Vector3().copy(n).multiplyScalar(overlap / 2));
              transform2.position.add(new Vector3().copy(n).multiplyScalar(overlap / 2));
            }
          }
        }
      });
    });
  }

  computeSceneBoundingSphere(scene: Scene$1) {
    let combinedGeometry: any = [];

    scene.traverse((child: Mesh) => {
      if (child.isMesh) {
        combinedGeometry.push(child.geometry.clone().applyMatrix4(scene.matrix));
      }
    });

    const geometry = BufferGeometryUtils.mergeBufferGeometries(combinedGeometry);
    geometry.computeBoundingSphere()

    return geometry.boundingSphere;
  }
}
