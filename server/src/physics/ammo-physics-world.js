import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ammo from 'ammo.js';
import { Vector3, LoadingManager } from 'three';

import { AssetManager } from '../asset-manager.js';

import Types from '../../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AmmoPhysicsWorld {
  constructor() {
    this.ready = false;
    this.collisions = [];
    this.onReady = null;
  }

  async init() {
    this.ammo = await Ammo();
    this.physicsWorld = this.createWorld();
    this.transform = new this.ammo.btTransform();
    this.quaternion = new this.ammo.btQuaternion(0, 0, 0, 1);
    this.vector3 = new this.ammo.btVector3(0, 0, 0);
    this.threeVector3 = new Vector3();

    await new Promise((resolve) => {
      const loadingManager = new LoadingManager();
      loadingManager.onLoad = () => {
        this.shapes = {};
        this.shapes[Types.Entities.SPACESHIP] = { 1: this.createShapeFromEntityType(Types.Entities.SPACESHIP) };
        this.shapes[Types.Entities.ASTEROID] = { 1: this.createShapeFromEntityType(Types.Entities.ASTEROID) };
        this.shapes[Types.Entities.BULLET] = { 1: this.createShapeFromEntityType(Types.Entities.BULLET) };
        resolve();
      };

      this.assetManager = new AssetManager(loadingManager);
      this.assetManager.loadModel({
        name: 'spaceship',
        url: path.join(__dirname, '../../models/fighter.glb')
      });
      this.assetManager.loadModel({
        name: 'asteroid',
        url: path.join(__dirname, '../../../client/public/models/asteroid.glb')
      });
    });

    this.ready = true;
    if (this.onReady) {this.onReady();}
  }

  add(entity) {
    const kind = entity.type;
    const scale = entity.transform.scale;

    let shape = this.shapes[kind][scale];
    if (!shape) {
      shape = this.createShapeFromEntityType(kind);
      this.shapes[kind][scale] = shape;
      shape.setLocalScaling(new this.ammo.btVector3(scale, scale, scale));
    }

    const rbInfo = this.createRigidBodyConstructionInfo(entity, shape);
    let body = new this.ammo.btRigidBody(rbInfo);
    // btRigidBody copies the fields it needs out of rbInfo; the motion state it
    // keeps is freed later in remove().
    this.ammo.destroy(rbInfo);
    body = this.setupRigidBody(body, entity);
    body.setCcdMotionThreshold(0.5);
    body.setCcdSweptSphereRadius(0.5);

    entity.body = body;
    body.entity = entity;

    this.physicsWorld.addRigidBody(body);
  }

  remove(entity) {
    if (!entity.body) {return;}
    const body = entity.body;
    const motionState = body.getMotionState();
    this.physicsWorld.removeRigidBody(body);
    // Bullet's btRigidBody destructor does not delete the motion state (it's
    // caller-owned), so free both. The collision shape is shared/cached by
    // kind+scale and must NOT be destroyed here.
    this.ammo.destroy(body);
    if (motionState) {this.ammo.destroy(motionState);}
    entity.body = null;
  }

  applyAll(world, delta) {
    this.reconcile(world);

    for (const entity of world.entities.values()) {
      if (entity.destroyed || entity.alive === false) {
        continue;
      }

      if (!entity.body) {
        continue;
      }

      if (entity.weight === 0) {
        continue;
      }

      const body = entity.body;
      const velocity = entity.velocity;
      const angularVelocity = entity.angularVelocity;

      const vec = this.vector3;

      vec.setX(velocity.x);
      vec.setY(velocity.y);
      vec.setZ(velocity.z);

      body.applyCentralLocalForce(vec);

      vec.setX(angularVelocity.x);
      vec.setY(angularVelocity.y);
      vec.setZ(angularVelocity.z);

      body.applyLocalTorque(vec);

      if (entity.kinematic) {
        const motionState = body.getMotionState();

        if (motionState) {
          const pos = entity.transform.position;
          const rot = entity.transform.rotation;
          const vel = this.threeVector3.copy(entity.velocity).applyQuaternion(rot);

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

        let { position: p, rotation: r } = entity.transform;

        let ep = { x: p.x, y: p.y, z: p.z };
        let er = { x: r.x.toPrecision(4), y: r.y.toPrecision(4), z: r.z.toPrecision(4), w: r.w.toPrecision(4) };

        let bp = { x: o.x(), y: o.y(), z: o.z() };
        let br = { x: q.x().toPrecision(4), y: q.y().toPrecision(4), z: q.z().toPrecision(4), w: q.w().toPrecision(4) };

        if (ep.x !== bp.x || ep.y !== bp.y || ep.z !== bp.z ||
            er.x !== br.x || er.y !== br.y || er.z !== br.z || er.w !== br.w) {
          entity.transform.position.set(o.x(), o.y(), o.z());
          entity.transform.rotation.set(q.x(), q.y(), q.z(), q.w());
        }
      }
    }
  }

  // A dead ship (alive === false) must have no physics body; on revive it gets
  // one back. Reconciling here keeps combat/respawn subsystems decoupled from
  // Ammo — they only flip `alive`, and the stepper owns body presence.
  reconcile(world) {
    for (const entity of world.entities.values()) {
      if (entity.type !== Types.Entities.SPACESHIP) {continue;}

      if (entity.alive === false && entity.body) {
        this.remove(entity);
      } else if (entity.alive === true && !entity.body) {
        this.add(entity);
      }
    }
  }

  step(delta) {
    this.physicsWorld.stepSimulation(delta/1000, 0, delta/1000);
    this.detectCollision();
  }

  drainCollisions() {
    const collisions = this.collisions;
    this.collisions = [];
    return collisions;
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
    const pos = entity.transform.position;
    const rot = entity.transform.rotation;
    const mass = entity.weight;

    const transform = new this.ammo.btTransform();
    transform.setIdentity();
    const origin = new this.ammo.btVector3(pos.x, pos.y, pos.z);
    transform.setOrigin(origin);
    const quaternion = new this.ammo.btQuaternion(rot.x, rot.y, rot.z, rot.w);
    transform.setRotation(quaternion);
    const motionState = new this.ammo.btDefaultMotionState(transform);

    const localInertia = new this.ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new this.ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);

    // motionState is retained by the body; the rest are copied by value here and
    // can be freed immediately (they'd otherwise leak on the Emscripten heap).
    this.ammo.destroy(localInertia);
    this.ammo.destroy(quaternion);
    this.ammo.destroy(origin);
    this.ammo.destroy(transform);

    return rbInfo;
  }

  setupRigidBody(body, entity) {
    const velocity = entity.velocity;
    const angularVelocity = entity.angularVelocity;

    body.setRestitution(0);
    body.setFriction(0);
    body.setDamping(entity.damping, entity.angularDamping);
    body.setSleepingThresholds(0, 0);

    const linVel = new this.ammo.btVector3(velocity.x, velocity.y, velocity.z);
    body.setLinearVelocity(linVel);
    this.ammo.destroy(linVel);

    const angVel = new this.ammo.btVector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
    body.setAngularVelocity(angVel);
    this.ammo.destroy(angVel);

    if (entity.kinematic && body.setCollisionFlags && body.getCollisionFlags) {
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

    const bulletsHit = new Set();

    for (let i = 0; i < numManifolds; i++) {
      let contactManifold = dispatcher.getManifoldByIndexInternal(i);

      let rb0 = this.ammo.castObject(contactManifold.getBody0(), this.ammo.btRigidBody);
      let rb1 = this.ammo.castObject(contactManifold.getBody1(), this.ammo.btRigidBody);

      let entity0 = rb0.entity;
      let entity1 = rb1.entity;

      if (!entity0 && !entity1) {continue;}

      let kind0;
      let kind1;

      if (entity0 && entity0.alive !== false) {
        kind0 = entity0.type;
      }

      if (entity1 && entity1.alive !== false) {
        kind1 = entity1.type;
      }

      let numContacts = contactManifold.getNumContacts();

      for (let j = 0; j < numContacts; j++) {
        let contactPoint = contactManifold.getContactPoint(j);
        let distance = contactPoint.getDistance();

        if (distance > 0) {continue;}

        if (!rb0.isStaticObject() && entity0 && entity0.alive !== false) {
          this.collisions.push({ a: entity0, b: entity1 });

          if (kind0 === Types.Entities.BULLET) {bulletsHit.add(entity0);}
        }

        if (!rb1.isStaticObject() && entity1 && entity1.alive !== false) {
          this.collisions.push({ a: entity1, b: entity0 });

          if (kind1 === Types.Entities.BULLET) {bulletsHit.add(entity1);}
        }
      }
    }

    // Remove (and free) hit bullets once, after the manifold walk, so a body is
    // never destroyed while a later manifold still holds its pointer. remove()
    // nulls entity.body, so the bullet's eventual despawn is a no-op — each body
    // is freed exactly once.
    for (const entity of bulletsHit) {
      this.remove(entity);
    }
  }

  createShapeFromEntityType(type) {
    if (type === Types.Entities.SPACESHIP) {return this.createConvexHullShape(this.assetManager.getTriangles('spaceship'));}
    if (type === Types.Entities.ASTEROID) {return this.createConvexHullShape(this.assetManager.getTriangles('asteroid'));}
    if (type === Types.Entities.BULLET) {return new this.ammo.btBoxShape(new this.ammo.btVector3(0.05, 0.05, 0.5));}
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
