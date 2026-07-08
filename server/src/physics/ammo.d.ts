// NOTE: no top-level import — this file must stay a global script so the
// `declare module 'ammo.js'` below is an ambient module declaration that
// overrides the untyped real `node_modules/ammo.js` build. The shared `Entity`
// back-reference is pulled in via an inline `import(...)` type instead (same
// server->shared direction; only ammo->shared would be the protected boundary).
declare module 'ammo.js' {
  export interface btVector3 {
    x(): number;
    y(): number;
    z(): number;
    setX(x: number): void;
    setY(y: number): void;
    setZ(z: number): void;
    setValue(x: number, y: number, z: number): void;
  }
  export interface btQuaternion {
    x(): number;
    y(): number;
    z(): number;
    w(): number;
    setValue(x: number, y: number, z: number, w: number): void;
  }
  export interface btMatrix3x3 {
    getRotation(q: btQuaternion): void;
  }
  export interface btTransform {
    setIdentity(): void;
    setOrigin(v: btVector3): void;
    getOrigin(): btVector3;
    setRotation(q: btQuaternion): void;
    getBasis(): btMatrix3x3;
  }
  export interface btMotionState {
    getWorldTransform(t: btTransform): void;
    setWorldTransform(t: btTransform): void;
  }
  export interface btCollisionShape {
    setLocalScaling(v: btVector3): void;
    calculateLocalInertia(mass: number, inertia: btVector3): void;
  }
  export interface btConvexHullShape extends btCollisionShape {
    addPoint(p: btVector3): void;
  }
  export interface btCollisionObject {
    isStaticObject(): boolean;
    isActive(): boolean;
    getCollisionFlags(): number;
    setCollisionFlags(f: number): void;
    setActivationState(s: number): void;
  }
  export interface btRigidBody extends btCollisionObject {
    // App-attached back-reference. Typed as the shared `Entity` (server-side
    // .d.ts importing shared IS the correct direction; only ammo->shared is the
    // protected boundary). `unknown` would break `entity.body = body` /
    // `body.entity = entity`; `Entity` compiles both with zero `any`.
    entity?: import('../../../shared/sim/entity.js').Entity;
    // Every body in this world is constructed with a motion state, so the file
    // dereferences `getMotionState()` unguarded (see applyAll). Typed non-null
    // to keep those method bodies byte-identical (see conversion report).
    getMotionState(): btMotionState;
    applyCentralLocalForce(v: btVector3): void;
    applyLocalTorque(v: btVector3): void;
    setRestitution(r: number): void;
    setFriction(f: number): void;
    setDamping(lin: number, ang: number): void;
    setSleepingThresholds(lin: number, ang: number): void;
    setLinearVelocity(v: btVector3): void;
    setAngularVelocity(v: btVector3): void;
    setCcdMotionThreshold(t: number): void;
    setCcdSweptSphereRadius(r: number): void;
  }
  export interface btManifoldPoint {
    getDistance(): number;
  }
  export interface btPersistentManifold {
    getBody0(): btCollisionObject;
    getBody1(): btCollisionObject;
    getNumContacts(): number;
    getContactPoint(i: number): btManifoldPoint;
  }
  export interface btDispatcher {
    getNumManifolds(): number;
    getManifoldByIndexInternal(i: number): btPersistentManifold;
  }
  export interface btDiscreteDynamicsWorld {
    setGravity(v: btVector3): void;
    addRigidBody(b: btRigidBody): void;
    removeRigidBody(b: btRigidBody): void;
    stepSimulation(
      dt: number,
      maxSubSteps: number,
      fixedTimeStep: number,
    ): void;
    getDispatcher(): btDispatcher;
  }
  export interface btRigidBodyConstructionInfo {
    _brand?: never;
  }

  export interface AmmoModule {
    btVector3: new (x?: number, y?: number, z?: number) => btVector3;
    btQuaternion: new (
      x: number,
      y: number,
      z: number,
      w: number,
    ) => btQuaternion;
    btTransform: new () => btTransform;
    btDefaultMotionState: new (t: btTransform) => btMotionState;
    btBoxShape: new (halfExtents: btVector3) => btCollisionShape;
    btConvexHullShape: new () => btConvexHullShape;
    btDefaultCollisionConfiguration: new () => object;
    btCollisionDispatcher: new (config: object) => btDispatcher;
    btDbvtBroadphase: new () => object;
    btSequentialImpulseConstraintSolver: new () => object;
    btDiscreteDynamicsWorld: new (
      dispatcher: btDispatcher,
      broadphase: object,
      solver: object,
      config: object,
    ) => btDiscreteDynamicsWorld;
    btRigidBodyConstructionInfo: new (
      mass: number,
      motionState: btMotionState,
      shape: btCollisionShape,
      localInertia: btVector3,
    ) => btRigidBodyConstructionInfo;
    btRigidBody: new (info: btRigidBodyConstructionInfo) => btRigidBody;
    castObject<T>(obj: unknown, type: new (...args: never[]) => T): T;
    destroy(obj: object): void;
  }

  const Ammo: () => Promise<AmmoModule>;
  export default Ammo;
}
