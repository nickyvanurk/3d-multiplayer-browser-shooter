import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import Messages from '../../shared/messages.ts';
import Types from '../../shared/types.ts';
import { test } from './harness.ts';

test('State round-trips pose, velocities and input', () => {
  const msg = new Messages.State(
    new Vector3(1, 2, 3),
    new Quaternion(0.1, 0.2, 0.3, 0.4),
    new Vector3(4, 5, 6),
    new Vector3(7, 8, 9),
    0b1010_0101,
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
  assert.equal(out.input, 0b1010_0101);
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

test('Ping round-trips the client send time', () => {
  const wire = new Messages.Ping(1234.5).serialize();
  assert.deepEqual(wire, [Types.Messages.PING, 1234.5]);
  const data = Messages.Ping.deserialize(wire.slice(1) as number[]);
  assert.equal(data.sentTime, 1234.5);
});

test('Pong echoes sentTime and carries serverTime', () => {
  const wire = new Messages.Pong(1234.5, 9000).serialize();
  assert.deepEqual(wire, [Types.Messages.PONG, 1234.5, 9000]);
  const data = Messages.Pong.deserialize(wire.slice(1) as number[]);
  assert.equal(data.sentTime, 1234.5);
  assert.equal(data.serverTime, 9000);
});

test('World carries a serverTime prefix before the entity run', () => {
  const entities = [
    { id: 42, state: [1, 2, 3, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
  ];
  const wire = new Messages.World(entities, 7777).serialize();
  assert.equal(wire[0], Types.Messages.WORLD);
  assert.equal(wire[1], 7777); // serverTime
  assert.equal(wire[2], 42); // first entity id

  const decoded = Messages.World.deserialize(wire.slice(1) as number[]);
  assert.equal(decoded.serverTime, 7777);
  assert.equal(decoded.entities.length, 1);
  assert.equal(decoded.entities[0].id, 42);
});
