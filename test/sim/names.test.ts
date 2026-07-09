import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { test } from './harness.ts';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import Utils from '../../shared/utils.ts';
import { generateName, NAME_REGEX } from '../../shared/names/generate-name.ts';

test('generateName produces a valid adjective+noun callsign', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generateName(), NAME_REGEX);
  }
});

test('generateName is deterministic for a given seed', () => {
  const a = generateName(Utils.randomNumberGenerator(42));
  const b = generateName(Utils.randomNumberGenerator(42));
  assert.equal(a, b);
  assert.match(a, NAME_REGEX);
});

test('Spawn round-trips the ship name through the wire format', () => {
  const spawn = new Messages.Spawn(
    5,
    Types.Entities.SPACESHIP,
    new Vector3(1, 2, 3),
    new Quaternion(),
    1,
    'FastWolf',
  );
  const wire = spawn.serialize();
  wire.shift(); // the transport strips the leading type byte before deserialize
  const parsed = Messages.Spawn.deserialize(wire);
  assert.equal(parsed.id, 5);
  assert.equal(parsed.name, 'FastWolf');
});
