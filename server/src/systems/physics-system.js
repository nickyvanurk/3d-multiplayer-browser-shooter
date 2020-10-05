import { System } from 'ecsy';
import { Quaternion } from 'three';
import Util from 'util';

import { Transform } from '../components/transform';
import { RigidBody } from '../components/rigidbody';

let quaternion = new Quaternion();

export class PhysicsSystem extends System {
  static queries = {
    entities: {
      components: [Transform, RigidBody],
      listen: {
        added: true,
        removed: true
      }
    },
  };

  init(Ammo) {
    this.epsilon = 10e-6;
    this.collisions = new Map();
    this.collisionKeys = [];
    this.frame = 0;

    this.ammo = Ammo;
    this.physicsWorld = this.createWorld(); 
    this.transform = new this.ammo.btTransform();
    this.quaternion = new this.ammo.btQuaternion(0, 0, 0, 1);

    this.bodyToEntity = new Map();
  }

  execute(delta) {
    this.frame++;

    this.queries.entities.added.forEach((entity) => {
      const body = this.setupRigidBody(this.createRigidBody(entity), entity);

      body.setCcdMotionThreshold(0.01);
      body.setCcdSweptSphereRadius(0.01);

      entity.body = body;
      this.physicsWorld.addRigidBody(body);
    });

    this.physicsWorld.stepSimulation(delta, 4, delta);

    this.queries.entities.results.forEach((entity) => {
      const rigidBody = entity.getComponent(RigidBody);

      if (rigidBody.weight === 0) {
        return;
      }

      const body = entity.body;
      const velocity = rigidBody.velocity;
      const angularVelocity = rigidBody.angularVelocity;

      body.applyCentralLocalForce(
        new this.ammo.btVector3(velocity.x, velocity.y, velocity.z)
      );
      body.applyLocalTorque(
        new this.ammo.btVector3(angularVelocity.x, angularVelocity.y, angularVelocity.z)
      );

      if (body.isActive() && body.getMotionState()) {
        const transform = this.transform;
        const q = this.quaternion;

        body.getMotionState().getWorldTransform(transform);
        const o = transform.getOrigin();
        transform.getBasis().getRotation(q);

        let transformComponent = entity.getMutableComponent(Transform);
        transformComponent.position.set(o.x(), o.y(), o.z());
        transformComponent.rotation.set(q.x(), q.y(), q.z(), q.w());
      }
    });
  }

  createWorld() {
    const config = new this.ammo.btDefaultCollisionConfiguration();
    this.dispatcher = new this.ammo.btCollisionDispatcher(config);
    const cache = new this.ammo.btDbvtBroadphase();
    const solver = new this.ammo.btSequentialImpulseConstraintSolver();
    const world = new this.ammo.btDiscreteDynamicsWorld(
      this.dispatcher,
      cache,
      solver,
      config
    );
    world.setGravity(new this.ammo.btVector3(0, 0, 0));

    return world;
  }

  createRigidBody(entity) {
    const rigidBody = entity.getComponent(RigidBody);
    const transform = entity.getComponent(Transform);

    const shape = new this.ammo.btSphereShape(1);
    const localInertia = new this.ammo.btVector3(1, 1, 1);
    shape.calculateLocalInertia(rigidBody.weight, localInertia);
    const form = new this.ammo.btTransform();
    form.setIdentity();
    form.setOrigin(
      new this.ammo.btVector3(
        transform.position.x,
        transform.position.y,
        transform.position.z
      )
    );

    quaternion.copy(transform.rotation);

    form.setRotation(
      new this.ammo.btQuaternion(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      )
    );

    const state = new this.ammo.btDefaultMotionState(form);
    const info = new this.ammo.btRigidBodyConstructionInfo(
      rigidBody.weight,
      state,
      shape,
      localInertia
    );

    const body = new this.ammo.btRigidBody(info);
    this.bodyToEntity.set(this.ammo.getPointer(body), entity);

    return body;
  }

  setupRigidBody(body, entity) {
    const rigidBody = entity.getComponent(RigidBody);
    const velocity = rigidBody.velocity;
    const angularVelocity = rigidBody.angularVelocity;

    body.setRestitution(0);
    body.setFriction(0);
    body.setDamping(rigidBody.damping, rigidBody.angularDamping);
    body.setSleepingThresholds(0, 0);
    body.setLinearVelocity(
      new this.ammo.btVector3(velocity.x, velocity.y, velocity.z)
    );
    body.setAngularVelocity(
      new this.ammo.btVector3(angularVelocity.x, angularVelocity.y, angularVelocity.z)
    );
    return body;
  }
}
