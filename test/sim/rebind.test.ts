import assert from 'node:assert/strict';
import {
  DEFAULT_KEYBINDINGS,
  mergeKeybindings,
} from '../../client/src/input/keybindings.ts';
import { applyBinding } from '../../client/src/input/rebind.ts';
import { test } from './harness.ts';

test('applyBinding assigns a new key without touching others', () => {
  const { bindings, unbound } = applyBinding(
    DEFAULT_KEYBINDINGS,
    'forward',
    'KeyI',
  );
  assert.equal(bindings.forward, 'KeyI');
  assert.equal(bindings.backward, 'KeyS');
  assert.deepEqual(unbound, []);
  // Pure: the input is not mutated.
  assert.equal(DEFAULT_KEYBINDINGS.forward, 'KeyW');
});

test('applyBinding rebinding an action to its own key is a no-op', () => {
  const { bindings, unbound } = applyBinding(
    DEFAULT_KEYBINDINGS,
    'forward',
    'KeyW',
  );
  assert.equal(bindings.forward, 'KeyW');
  assert.deepEqual(unbound, []);
});

test('applyBinding warns + unbinds the other action holding the key', () => {
  // Bind forward to S, which backward already uses.
  const { bindings, unbound } = applyBinding(
    DEFAULT_KEYBINDINGS,
    'forward',
    'KeyS',
  );
  assert.equal(bindings.forward, 'KeyS');
  assert.equal(bindings.backward, null);
  assert.deepEqual(unbound, ['backward']);
});

test('applyBinding conflicts are isolated per value-space (key vs mouse)', () => {
  // weaponPrimary is button 0; binding a key action to "0" must not disturb it.
  const { bindings, unbound } = applyBinding(
    DEFAULT_KEYBINDINGS,
    'forward',
    'Digit0',
  );
  assert.equal(bindings.forward, 'Digit0');
  assert.equal(bindings.weaponPrimary, 0);
  assert.deepEqual(unbound, []);
});

test('applyBinding rebinds a mouse button, unbinding the other fire slot', () => {
  const { bindings, unbound } = applyBinding(
    DEFAULT_KEYBINDINGS,
    'weaponSecondary',
    0,
  );
  assert.equal(bindings.weaponSecondary, 0);
  assert.equal(bindings.weaponPrimary, null);
  assert.deepEqual(unbound, ['weaponPrimary']);
});

test('mergeKeybindings fills defaults for missing actions', () => {
  const merged = mergeKeybindings({ forward: 'KeyI' });
  assert.equal(merged.forward, 'KeyI');
  assert.equal(merged.backward, DEFAULT_KEYBINDINGS.backward);
  assert.equal(merged.cameraOrbit, DEFAULT_KEYBINDINGS.cameraOrbit);
});

test('mergeKeybindings preserves a persisted null (intentional unbind)', () => {
  const merged = mergeKeybindings({ boost: null });
  assert.equal(merged.boost, null);
});

test('mergeKeybindings ignores wrong-typed / unknown values', () => {
  const merged = mergeKeybindings({
    forward: 5, // key action given a number -> ignored
    weaponPrimary: 'KeyX', // mouse action given a string -> ignored
    bogus: 'KeyZ', // unknown action -> dropped
  });
  assert.equal(merged.forward, DEFAULT_KEYBINDINGS.forward);
  assert.equal(merged.weaponPrimary, DEFAULT_KEYBINDINGS.weaponPrimary);
  assert.ok(!('bogus' in merged));
});

test('mergeKeybindings falls back to defaults for non-objects', () => {
  assert.deepEqual(mergeKeybindings(null), DEFAULT_KEYBINDINGS);
  assert.deepEqual(mergeKeybindings('nope'), DEFAULT_KEYBINDINGS);
});
