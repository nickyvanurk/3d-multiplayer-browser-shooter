// test/sim/input.test.js
import assert from 'node:assert/strict';
import { InputCommand } from '../../shared/sim/input.ts';
import { test } from './harness.ts';

type BooleanField =
  | 'forward'
  | 'backward'
  | 'rollLeft'
  | 'rollRight'
  | 'strafeLeft'
  | 'strafeRight'
  | 'strafeUp'
  | 'strafeDown'
  | 'boost'
  | 'weaponPrimary';

test('InputCommand copies data and seq', () => {
  const cmd = new InputCommand({ forward: true }, 7);
  assert.equal(cmd.seq, 7);
  assert.equal(cmd.forward, true);
});

test('InputCommand defaults are false, aim null, seq 0', () => {
  const cmd = new InputCommand();
  const booleans: BooleanField[] = [
    'forward',
    'backward',
    'rollLeft',
    'rollRight',
    'strafeLeft',
    'strafeRight',
    'strafeUp',
    'strafeDown',
    'boost',
    'weaponPrimary',
  ];
  for (const field of booleans) {
    assert.equal(cmd[field], false);
  }
  assert.equal(cmd.aim, null);
  assert.equal(cmd.seq, 0);
});

test('InputCommand.empty returns an all-default command', () => {
  const cmd = InputCommand.empty();
  assert.equal(cmd.forward, false);
  assert.equal(cmd.aim, null);
  assert.equal(cmd.seq, 0);
});
