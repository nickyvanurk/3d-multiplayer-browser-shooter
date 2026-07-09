import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Vendor } from '../../shared/sim/entities/vendor.ts';
import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import { NodeMeshProvider } from '../../server/src/physics/node-mesh-provider.ts';
import { InputBits } from '../../shared/sim/input.ts';
import type { EntityWorld } from '../../shared/sim/entity.ts';
import type { MeshProvider } from '../../shared/sim/physics/mesh-provider.ts';
import Types from '../../shared/types.ts';
import { test } from './harness.ts';

const noWorld: EntityWorld = { spawn: (e) => e };

function newPhysics(): RapierPhysicsWorld {
  return new RapierPhysicsWorld({
    init: async () => {},
    getTriangles: () => [],
  } as unknown as MeshProvider);
}

// Same fake RigidBody shape used by rapier-body-sync.test.ts.
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
  };
}

test('Vendor is a kinematic, undamageable NPC of type VENDOR', () => {
  const vendor = new Vendor();
  assert.equal(vendor.type, Types.Entities.VENDOR);
  assert.equal(vendor.kinematic, true);
  assert.equal(vendor.weight, 0);
  // No health/damage fields → combat duck-typing never touches it.
  assert.equal((vendor as { health?: number }).health, undefined);
  // Engine is always on so the exhaust glows.
  assert.equal(vendor.inputBits, InputBits.forward);
});

test('Vendor packs its thrust bits into network slot [13] for remote exhaust', () => {
  const vendor = new Vendor();
  const state = vendor.serializeNetworkState();
  assert.equal(state.length, 15);
  assert.equal(state[13], InputBits.forward);
  // The vendor is undamageable, so its health slot stays 0.
  assert.equal(state[14], 0);
});

test('Vendor.update places it on the orbit with a tangent velocity', () => {
  const vendor = new Vendor();
  vendor.update(16, noWorld, 0); // theta = 0 → (R, 0, 0), moving +z

  assert.ok(Math.abs(vendor.transform.position.x - 3000) < 1e-6);
  assert.ok(Math.abs(vendor.transform.position.y) < 1e-6);
  assert.ok(Math.abs(vendor.transform.position.z) < 1e-6);

  // Velocity is a non-zero world-space tangent (perpendicular to the radius).
  const speed = vendor.velocity.length();
  assert.ok(speed > 1, `expected a real cruise speed, got ${speed}`);
  assert.ok(
    Math.abs(vendor.velocity.x) < 1e-6,
    'tangent at theta=0 is +z only',
  );
  assert.ok(vendor.velocity.z > 0);
});

test('Vendor orbit stays entirely outside the ±2000 asteroid field', () => {
  const vendor = new Vendor();
  for (let i = 0; i < 360; i++) {
    // Sample a full period (ORBIT_PERIOD_MS = 180000) at 1-degree steps.
    vendor.update(16, noWorld, (i / 360) * 180_000);
    const { x, z } = vendor.transform.position;
    assert.ok(
      Math.max(Math.abs(x), Math.abs(z)) > 2050,
      `orbit point (${x.toFixed(0)}, ${z.toFixed(0)}) is inside the field cube`,
    );
  }
});

test('writeBack round-trips a kinematic Vendor pose without clobbering velocity', () => {
  const physics = newPhysics();
  const vendor = new Vendor();
  // Route velocity the client dead-reckons on; the kinematic solver must not
  // overwrite it (only ships that self-simulate write velocity back).
  vendor.velocity.set(0, 0, 42);
  const body = fakeBody(
    { x: 100, y: 0, z: 200 },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: 9, y: 9, z: 9 },
  );
  vendor.body = body as never;
  physics.bodies.add(vendor);

  physics.writeBack();

  // Pose read back from the (kinematic) body...
  assert.equal(vendor.transform.position.x, 100);
  assert.equal(vendor.transform.position.z, 200);
  // ...but the route velocity is preserved.
  assert.equal(vendor.velocity.z, 42);
});

// Regression for the asset-manager updateMatrixWorld fix: the transport GLB has a
// 0.01 root-node scale over ~13,700-unit geometry. Without applying the node
// transform the server hull would be ~100x too large (a field-filling wall).
test('server Vendor collision hull applies the model node scale (~137u, not ~13,700u)', async () => {
  const provider = new NodeMeshProvider();
  await provider.init();
  const triangles = provider.getTriangles(Types.Entities.VENDOR, 1);
  assert.ok(triangles.length > 0, 'expected a non-empty triangle soup');

  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const tri of triangles) {
    for (const p of tri) {
      min.min(new Vector3(p.x, p.y, p.z));
      max.max(new Vector3(p.x, p.y, p.z));
    }
  }
  const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  assert.ok(
    extent > 20 && extent < 500,
    `hull extent ${extent.toFixed(1)} — node scale not applied (expected ~137)`,
  );
});
