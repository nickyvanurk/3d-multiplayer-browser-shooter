import assert from 'node:assert/strict';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import type { MeshProvider } from '../../shared/sim/physics/mesh-provider.ts';
import type { World } from '../../shared/sim/world.ts';
import { test } from './harness.ts';

// A stand-in Rapier RigidBody that records whether the solver had a force/torque
// applied to it, so we can assert applyAll's thrust branch without the wasm solver.
function forceRecordingBody() {
  const calls = { addForce: 0, addTorque: 0 };
  return {
    calls,
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    resetForces: () => {},
    resetTorques: () => {},
    addForce: () => {
      calls.addForce++;
    },
    addTorque: () => {
      calls.addTorque++;
    },
  };
}

function newPhysics(): RapierPhysicsWorld {
  return new RapierPhysicsWorld({
    init: async () => {},
    getTriangles: () => [],
  } as unknown as MeshProvider);
}

// A dynamic body (weight 1, non-kinematic) whose entity.velocity is non-zero.
function dynamicEntityWithBody() {
  const entity = new Asteroid({ transform: { scale: 1 } }); // weight 1, dynamic
  entity.velocity.set(5, 0, 0);
  entity.angularVelocity.set(0, 1, 0);
  const body = forceRecordingBody();
  entity.body = body as never;
  return { entity, body };
}

function worldOf(entity: unknown): World {
  return { entities: new Map([[1, entity]]) } as unknown as World;
}

// Root cause of the Rapier `unreachable` crash: writeBack mirrors the solver's
// post-step velocity into entity.velocity, and applyAll re-applied that velocity
// as a thrust force every tick — a runaway feedback loop that diverges to NaN.
// On the server (writeBackVelocity), entity.velocity is ACTUAL velocity, so the
// thrust branch must be skipped; the body coasts under the solver instead.
test('applyAll does NOT apply entity velocity as a force when velocity is written back (server)', () => {
  const physics = newPhysics();
  physics.reconcileShips = false;
  physics.writeBackVelocity = true; // server
  const { entity, body } = dynamicEntityWithBody();

  physics.applyAll(worldOf(entity), 1000 / 60);

  assert.equal(
    body.calls.addForce,
    0,
    'no force should be applied on the server',
  );
  assert.equal(
    body.calls.addTorque,
    0,
    'no torque should be applied on the server',
  );
});

// The client's owned ship still moves: applyInput writes entity.velocity as a
// THRUST COMMAND, which applyAll must apply as a force (writeBackVelocity off).
test('applyAll applies entity velocity as a force when velocity is a thrust command (client)', () => {
  const physics = newPhysics();
  physics.reconcileShips = false;
  physics.writeBackVelocity = false; // client
  const { entity, body } = dynamicEntityWithBody();

  physics.applyAll(worldOf(entity), 1000 / 60);

  assert.equal(
    body.calls.addForce,
    1,
    'thrust force must be applied on the client',
  );
  assert.equal(
    body.calls.addTorque,
    1,
    'thrust torque must be applied on the client',
  );
});
