import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import Messages from '../../shared/messages.ts';
import Types from '../../shared/types.ts';
import { quantizeState } from '../../shared/sim/net/quantize.ts';
import { test } from './harness.ts';

function assertClose(actual: number[], expected: number[], tol: number): void {
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tol,
      `index ${i}: ${actual[i]} vs ${expected[i]} (tol ${tol})`,
    );
  }
}

function quatAngle(a: Quaternion, b: Quaternion): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, dot));
}

test('State round-trips pose, velocities and input (binary, quantized)', () => {
  const rotation = new Quaternion(0.1, 0.2, 0.3, 0.4).normalize();
  const msg = new Messages.State(
    new Vector3(1, 2, 3),
    rotation,
    new Vector3(4, 5, 6),
    new Vector3(7, 8, 9),
    0b1010_0101,
  );

  const wire = msg.serialize();
  assert.ok(wire instanceof Uint8Array);
  assert.equal(wire[0], Types.Messages.STATE);

  const out = Messages.State.deserialize(wire);
  assertClose(
    [out.position.x, out.position.y, out.position.z],
    [1, 2, 3],
    0.05,
  );
  assert.ok(quatAngle(rotation, out.rotation) < 0.03);
  assertClose(
    [out.velocity.x, out.velocity.y, out.velocity.z],
    [4, 5, 6],
    0.02,
  );
  assertClose(
    [out.angularVelocity.x, out.angularVelocity.y, out.angularVelocity.z],
    [7, 8, 9],
    0.01,
  );
  assert.equal(out.input, 0b1010_0101);
});

test('Fire round-trips the muzzle transform and speed', () => {
  const msg = new Messages.Fire(
    new Vector3(10, 20, 30),
    new Quaternion(0, 0, 0, 1),
    1.5,
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
  assert.equal(out.speed, 1.5);
});

test('Shot round-trips shooter id, muzzle transform and speed', () => {
  const msg = new Messages.Shot(
    42,
    new Vector3(10, 20, 30),
    new Quaternion(0, 0, 0, 1),
    1.5,
  );

  const wire = msg.serialize();
  assert.equal(wire[0], Types.Messages.SHOT);

  const out = Messages.Shot.deserialize(wire.slice(1) as number[]);
  assert.equal(out.shooterId, 42);
  assert.deepEqual(
    [out.position.x, out.position.y, out.position.z],
    [10, 20, 30],
  );
  assert.deepEqual(
    [out.rotation.x, out.rotation.y, out.rotation.z, out.rotation.w],
    [0, 0, 0, 1],
  );
  assert.equal(out.speed, 1.5);
});

test('Hit round-trips target, damage and impact', () => {
  const msg = new Messages.Hit(7, 30, new Vector3(1, 2, 3));

  const wire = msg.serialize();
  assert.equal(wire[0], Types.Messages.HIT);

  const out = Messages.Hit.deserialize(wire.slice(1) as number[]);
  assert.equal(out.targetId, 7);
  assert.equal(out.damage, 30);
  assert.deepEqual([out.position.x, out.position.y, out.position.z], [1, 2, 3]);
  // No mining factor supplied → absent on the wire (0) → undefined on the far end.
  assert.equal(out.miningFactor, undefined);
});

test('Hit round-trips an explicit mining factor', () => {
  const out = Messages.Hit.deserialize(
    new Messages.Hit(7, 1, new Vector3(1, 2, 3), 8)
      .serialize()
      .slice(1) as number[],
  );
  assert.equal(out.miningFactor, 8);
});

test('Loadout round-trips ownership and the per-slot item ids', () => {
  const wire = new Messages.Loadout(true, 0, -1).serialize();
  assert.equal(wire[0], Types.Messages.LOADOUT);

  const out = Messages.Loadout.deserialize(wire.slice(1) as number[]);
  assert.equal(out.hasMiningLaser, true);
  assert.equal(out.primaryItem, 0);
  assert.equal(out.secondaryItem, -1);
});

test('Equip round-trips slot and item id', () => {
  const out = Messages.Equip.deserialize(
    new Messages.Equip(1, 0).serialize().slice(1) as number[],
  );
  assert.equal(out.slot, 1);
  assert.equal(out.itemId, 0);
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

test('World round-trips serverTime and quantized entities (binary)', () => {
  // Float network-state layout: pos, quat xyzw, vel, angVel, input, health, level.
  const state = quantizeState([
    1, 2, 3, 0, 0, 0, 1, 0.5, -0.5, 0.25, 0, 0, 0, 5, 87, 3,
  ]);
  const entities = [{ id: 42, state }];
  const wire = new Messages.World(entities, 7777).serialize();
  assert.ok(wire instanceof Uint8Array);
  assert.equal(wire[0], Types.Messages.WORLD);

  const decoded = Messages.World.deserialize(wire);
  assert.equal(decoded.serverTime, 7777);
  assert.equal(decoded.entities.length, 1);
  const e = decoded.entities[0];
  assert.equal(e.id, 42);
  assertClose([e.position.x, e.position.y, e.position.z], [1, 2, 3], 0.05);
  assertClose(
    [e.velocity.x, e.velocity.y, e.velocity.z],
    [0.5, -0.5, 0.25],
    0.02,
  );
  assert.equal(e.input, 5);
  assert.equal(e.health, 87);
  assert.equal(e.level, 3);
});

test('Progress round-trips level, xp and xpForNext', () => {
  const wire = new Messages.Progress(3, 25, 90).serialize();
  assert.equal(wire[0], Types.Messages.PROGRESS);

  const out = Messages.Progress.deserialize(wire.slice(1) as number[]);
  assert.equal(out.level, 3);
  assert.equal(out.xp, 25);
  assert.equal(out.xpForNext, 90);
});

test('Leaderboard round-trips entries plus the recipient own standing', () => {
  const entries = [
    { name: 'Ace', level: 9 },
    { name: 'Red Baron', level: 5 },
  ];
  const wire = new Messages.Leaderboard(entries, 14, 2).serialize();
  assert.equal(wire[0], Types.Messages.LEADERBOARD);

  const out = Messages.Leaderboard.deserialize(
    wire.slice(1) as (number | string)[],
  );
  assert.equal(out.selfRank, 14);
  assert.equal(out.selfLevel, 2);
  assert.deepEqual(out.entries, entries);
});

test('Leaderboard with no entries still carries the self standing', () => {
  const out = Messages.Leaderboard.deserialize(
    new Messages.Leaderboard([], 1, 4).serialize().slice(1) as (
      | number
      | string
    )[],
  );
  assert.equal(out.selfRank, 1);
  assert.equal(out.selfLevel, 4);
  assert.deepEqual(out.entries, []);
});
