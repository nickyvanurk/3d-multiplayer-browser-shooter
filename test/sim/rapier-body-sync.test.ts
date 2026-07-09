import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import type { MeshProvider } from '../../shared/sim/physics/mesh-provider.ts';
import { test } from './harness.ts';

// A stand-in Rapier RigidBody: records set* calls and reports the get* values,
// so writeBack/correctBody can be exercised without loading the wasm solver.
function fakeBody(
  t = { x: 0, y: 0, z: 0 },
  r = { x: 0, y: 0, z: 0, w: 1 },
  lv = { x: 0, y: 0, z: 0 },
  av = { x: 0, y: 0, z: 0 },
) {
  const s = { t: { ...t }, r: { ...r }, lv: { ...lv }, av: { ...av } };
  return {
    s,
    translation: () => s.t,
    rotation: () => s.r,
    linvel: () => s.lv,
    angvel: () => s.av,
    setTranslation: (v: Vector3) => (s.t = { x: v.x, y: v.y, z: v.z }),
    setRotation: (q: { x: number; y: number; z: number; w: number }) =>
      (s.r = { x: q.x, y: q.y, z: q.z, w: q.w }),
    setLinvel: (v: Vector3) => (s.lv = { x: v.x, y: v.y, z: v.z }),
    setAngvel: (v: Vector3) => (s.av = { x: v.x, y: v.y, z: v.z }),
  };
}

function newPhysics(): RapierPhysicsWorld {
  return new RapierPhysicsWorld({
    init: async () => {},
    getTriangles: () => [],
  } as unknown as MeshProvider);
}

test('writeBack mirrors a dynamic body’s velocity back onto the entity (so broadcast can coast it)', () => {
  const physics = newPhysics();
  const ship = new Ship(); // dynamic: kinematic === false, weight 1
  const body = fakeBody(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 5, z: 6 },
  );
  ship.body = body as never;
  physics.bodies.add(ship);

  physics.writeBack();

  assert.deepEqual(
    [ship.velocity.x, ship.velocity.y, ship.velocity.z],
    [1, 2, 3],
  );
  assert.deepEqual(
    [ship.angularVelocity.x, ship.angularVelocity.y, ship.angularVelocity.z],
    [4, 5, 6],
  );
});

test('writeBack leaves entity velocity untouched when velocity write-back is disabled (client control accumulators)', () => {
  const physics = newPhysics();
  physics.writeBackVelocity = false; // client: the owned ship self-controls
  const ship = new Ship();
  // Roll is an accumulator in angularVelocity.z (applyInput does z += ...); the
  // client owned ship must keep it, not have it clobbered by the solver.
  ship.angularVelocity.set(0, 0, 5);
  ship.velocity.set(0, 0, 1);
  const body = fakeBody(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: 9, y: 9, z: 9 },
    { x: 9, y: 9, z: 9 },
  );
  ship.body = body as never;
  physics.bodies.add(ship);

  physics.writeBack();

  // Control accumulators preserved; only the transform was written back.
  assert.equal(ship.angularVelocity.z, 5);
  assert.equal(ship.velocity.z, 1);
});

test('correctBody snaps the body and entity to the authoritative pose + velocity', () => {
  const physics = newPhysics();
  const ship = new Ship();
  const body = fakeBody();
  ship.body = body as never;

  physics.correctBody(
    ship,
    new Vector3(10, 20, 30),
    new Quaternion(0, 0, 0, 1),
    new Vector3(7, 8, 9),
    new Vector3(0, 1, 0),
  );

  // Body was snapped.
  assert.deepEqual(body.s.t, { x: 10, y: 20, z: 30 });
  assert.deepEqual(body.s.lv, { x: 7, y: 8, z: 9 });
  assert.deepEqual(body.s.av, { x: 0, y: 1, z: 0 });
  // Entity mirrors it (broadcast reads entity.velocity; render reads transform).
  assert.equal(ship.transform.position.x, 10);
  assert.equal(ship.transform.position.z, 30);
  assert.equal(ship.velocity.y, 8);
});
