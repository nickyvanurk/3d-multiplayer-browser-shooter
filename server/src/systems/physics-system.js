const path = require('path');
import { System } from 'ecsy';
import { Vector3, LoadingManager } from 'three';

import { AssetManager } from '../asset-manager';

import Types from '../../../shared/types';
import { Kind } from '../../../shared/components/kind';
import { Transform } from '../components/transform';
import { RigidBody } from '../components/rigidbody';
import { Destroy } from '../components/destroy';
import { Collision } from '../components/collision';

export class PhysicsSystem extends System {
  static queries = {
    entities: {
      components: [Transform, RigidBody, Kind],
      listen: {
        added: true,
        removed: true
      }
    },
  };

  init({ worldServer, ammo }) {
    this.worldServer = worldServer;
    this.ammo = ammo;
    this.physicsWorld = this.createWorld();
    this.transform = new this.ammo.btTransform();
    this.quaternion = new this.ammo.btQuaternion(0, 0, 0, 1);
    this.vector3 = new this.ammo.btVector3(0, 0, 0);
    this.threeVector3 = new Vector3();

    const loadingManager = new LoadingManager();
    loadingManager.onLoad = this.handleLoad.bind(this);

    this.assetManager = new AssetManager(loadingManager);
    this.assetManager.loadModel({
      name: 'spaceship',
      url: path.join(__dirname, '../../../client/public/models/spaceship.gltf')
    });
    this.assetManager.loadModel({
      name: 'asteroid',
      url: path.join(__dirname, '../../../client/public/models/asteroid.gltf')
    });

    this.stop();
  }

  handleLoad() {
    this.shapes = {};
    this.shapes[Types.Entities.SPACESHIP] = { 1: this.createShapeFromEntityType(Types.Entities.SPACESHIP) };
    this.shapes[Types.Entities.ASTEROID] = { 1: this.createShapeFromEntityType(Types.Entities.ASTEROID) };
    this.shapes[Types.Entities.BULLET] = { 1: this.createShapeFromEntityType(Types.Entities.BULLET) };

    this.play();
    this.worldServer.spawnAsteroids(100);
  }

  execute(delta) {
    this.queries.entities.added.forEach((entity) => {
      const kind = entity.getComponent(Kind).value;
      const scale = entity.getComponent(Transform).scale;

      let shape = this.shapes[kind][scale];
      if (!shape) {
        shape = this.createShapeFromEntityType(kind);
        this.shapes[kind][scale] = shape;
        shape.setLocalScaling(new this.ammo.btVector3(scale, scale, scale));
      }

      const rbInfo = this.createRigidBodyConstructionInfo(entity, shape);
      let body = new this.ammo.btRigidBody(rbInfo);
      body = this.setupRigidBody(body, entity);
      body.setCcdMotionThreshold(0.5);
      body.setCcdSweptSphereRadius(0.5);

      entity.body = body;
      body.entity = entity;

      this.physicsWorld.addRigidBody(body);
    });

    this.queries.entities.removed.forEach((entity) => {
      this.physicsWorld.removeRigidBody(entity.body);
    });

    this.queries.entities.results.forEach((entity) => {
      if (entity.hasComponent(Destroy) || !entity.alive) {
        return;
      }

      const rigidBody = entity.getComponent(RigidBody);

      if (rigidBody.weight === 0) {
        return;
      }

      const body = entity.body;
      const velocity = rigidBody.velocity;
      const angularVelocity = rigidBody.angularVelocity;

      const vec = this.vector3;


      vec.setX(velocity.x);
      vec.setY(velocity.y);
      vec.setZ(velocity.z);

      body.applyCentralLocalForce(vec);

      vec.setX(angularVelocity.x);
      vec.setY(angularVelocity.y);
      vec.setZ(angularVelocity.z);

      body.applyLocalTorque(vec);

      if (rigidBody.kinematic) {
        const motionState = body.getMotionState();

        if (motionState) {
          const transformComponent = entity.getComponent(Transform);

          const pos = transformComponent.position;
          const rot = transformComponent.rotation;
          const vel = this.threeVector3.copy(rigidBody.velocity).applyQuaternion(rot);

          const vec = this.vector3;
          vec.setX(pos.x + vel.x * delta);
          vec.setY(pos.y + vel.y * delta);
          vec.setZ(pos.z + vel.z * delta);

          const q = this.quaternion;
          q.setValue(rot.x, rot.y, rot.z, rot.w);

          const transform = this.transform;
          transform.setIdentity();
          transform.setOrigin(vec);
          transform.setRotation(q);

          motionState.setWorldTransform(transform);
        }
      }

      if (body.isActive() && body.getMotionState()) {
        const transform = this.transform;
        const q = this.quaternion;

        body.getMotionState().getWorldTransform(transform);
        const o = transform.getOrigin();
        transform.getBasis().getRotation(q);

        let { position: p, rotation: r } = entity.getComponent(Transform);

        let ep = { x: p.x, y: p.y, z: p.z };
        let er = { x: r.x.toPrecision(4), y: r.y.toPrecision(4), z: r.z.toPrecision(4), w: r.w.toPrecision(4) };

        let bp = { x: o.x(), y: o.y(), z: o.z() };
        let br = { x: q.x().toPrecision(4), y: q.y().toPrecision(4), z: q.z().toPrecision(4), w: q.w().toPrecision(4) };

        if (ep.x !== bp.x || ep.y !== bp.y || ep.z !== bp.z ||
            er.x !== br.x || er.y !== br.y || er.z !== br.z || er.w !== br.w) {
          let transformComponent = entity.getMutableComponent(Transform);
          transformComponent.position.set(o.x(), o.y(), o.z());
          transformComponent.rotation.set(q.x(), q.y(), q.z(), q.w());
        }
      }
    });

    this.physicsWorld.stepSimulation(delta/1000, 0, delta/1000);
    this.detectCollision();
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

  createRigidBodyConstructionInfo(entity, shape) {
      const transformComponent = entity.getComponent(Transform);
      const mass = entity.getComponent(RigidBody).weight;

      const pos = transformComponent.position;
      const rot = transformComponent.rotation;

      let transform = new this.ammo.btTransform();
      transform.setIdentity();
      transform.setOrigin(new this.ammo.btVector3(pos.x, pos.y, pos.z));
      transform.setRotation(new this.ammo.btQuaternion(rot.x, rot.y, rot.z, rot.w));
      const motionState = new this.ammo.btDefaultMotionState(transform);

      const localInertia = new this.ammo.btVector3(0, 0, 0);
      shape.calculateLocalInertia(mass, localInertia);

      return new this.ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
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

    if (rigidBody.kinematic && body.setCollisionFlags && body.getCollisionFlags) {
      const CF_NO_CONTACT_RESPONSE = 4;
      const CF_KINEMATIC_OBJECT= 2;
      const DISABLE_DEACTIVATION = 4;

      body.setCollisionFlags(
        body.getCollisionFlags() |
        CF_NO_CONTACT_RESPONSE |
        CF_KINEMATIC_OBJECT
      );
      body.setActivationState(DISABLE_DEACTIVATION);
    }

    return body;
  }

  detectCollision() {
    let dispatcher = this.physicsWorld.getDispatcher();
    let numManifolds = dispatcher.getNumManifolds();

    for (let i = 0; i < numManifolds; i++) {
      let contactManifold = dispatcher.getManifoldByIndexInternal(i);

      let rb0 = this.ammo.castObject(contactManifold.getBody0(), this.ammo.btRigidBody);
      let rb1 = this.ammo.castObject(contactManifold.getBody1(), this.ammo.btRigidBody);

      let entity0 = rb0.entity;
      let entity1 = rb1.entity;

      if (!entity0 && !entity1) continue;

      let kind0;
      let kind1;

      if (entity0.alive && entity0.hasComponent(Kind)) {
        kind0 = entity0.getComponent(Kind).value;
      }

      if (entity1.alive && entity1.hasComponent(Kind)) {
        kind1 = entity1.getComponent(Kind).value;
      }

      let numContacts = contactManifold.getNumContacts();

      for (let j = 0; j < numContacts; j++) {
        let contactPoint = contactManifold.getContactPoint(j);
        let distance = contactPoint.getDistance();

        if (distance > 0) continue;

        if (!rb0.isStaticObject() && entity0.alive) {
          if (!entity0.hasComponent(Collision)) {
            entity0.addComponent(Collision);
          }

          entity0.getMutableComponent(Collision).collidingWith.push(entity1);

          if (kind0 === Types.Entities.BULLET) {
            this.physicsWorld.removeRigidBody(entity0.body);
          }
        }

        if (!rb1.isStaticObject() && entity1.alive) {
          if (!entity1.hasComponent(Collision)) {
            entity1.addComponent(Collision);
          }

          entity1.getMutableComponent(Collision).collidingWith.push(entity0);

          if (kind1 === Types.Entities.BULLET) {
            this.physicsWorld.removeRigidBody(entity1.body);
          }
        }
      }
    }
  }

  createShapeFromEntityType(type) {
    if (type === Types.Entities.SPACESHIP) return this.createConvexHullShape(this.assetManager.getTriangles('spaceship'));
    if (type === Types.Entities.ASTEROID) return this.createConvexHullShape(this.assetManager.getTriangles('asteroid'));
    if (type === Types.Entities.BULLET) return new this.ammo.btBoxShape(new this.ammo.btVector3(0.05, 0.05, 0.5));
    throw new Error('Unknown entity type');
  }

  createConvexHullShape(triangles) {
    const convexHullShape = new this.ammo.btConvexHullShape();
    const vec = new this.ammo.btVector3();

    for (const triangle of triangles) {
      vec.setX(triangle[0].x);
      vec.setY(triangle[0].y);
      vec.setZ(triangle[0].z);
      convexHullShape.addPoint(vec);

      vec.setX(triangle[1].x);
      vec.setY(triangle[1].y);
      vec.setZ(triangle[1].z);
      convexHullShape.addPoint(vec);

      vec.setX(triangle[2].x);
      vec.setY(triangle[2].y);
      vec.setZ(triangle[2].z);
      convexHullShape.addPoint(vec);
    }

    return convexHullShape;
  }
}
