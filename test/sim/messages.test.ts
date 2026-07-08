import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import Messages from '../../shared/messages.ts';
import Types from '../../shared/types.ts';
import { test } from './harness.ts';

test('State round-trips pose and velocities', () => {
  const msg = new Messages.State(
    new Vector3(1, 2, 3),
    new Quaternion(0.1, 0.2, 0.3, 0.4),
    new Vector3(4, 5, 6),
    new Vector3(7, 8, 9),
  );

  const wire = msg.serialize();
  assert.equal(wire[0], Types.Messages.STATE);

  const out = Messages.State.deserialize(wire.slice(1) as number[]);
  assert.deepEqual([out.position.x, out.position.y, out.position.z], [1, 2, 3]);
  assert.deepEqual(
    [out.rotation.x, out.rotation.y, out.rotation.z, out.rotation.w],
    [0.1, 0.2, 0.3, 0.4],
  );
  assert.deepEqual([out.velocity.x, out.velocity.y, out.velocity.z], [4, 5, 6]);
  assert.deepEqual(
    [out.angularVelocity.x, out.angularVelocity.y, out.angularVelocity.z],
    [7, 8, 9],
  );
});

test('Fire round-trips muzzle transform, damage and bullet id', () => {
  const msg = new Messages.Fire(
    new Vector3(10, 20, 30),
    new Quaternion(0, 0, 0, 1),
    5,
    1_000_042,
  );

  const wire = msg.serialize();
  assert.equal(wire[0], Types.Messages.FIRE);

  const out = Messages.Fire.deserialize(wire.slice(1) as number[]);
  assert.deepEqual(
    [out.position.x, out.position.y, out.position.z],
    [10, 20, 30],
  );
  assert.deepEqual(
    [out.rotation.x, out.rotation.y, out.rotation.z, out.rotation.w],
    [0, 0, 0, 1],
  );
  assert.equal(out.damage, 5);
  assert.equal(out.bulletId, 1_000_042);
});
