import type { Keybindings, KeybindingAction } from './keybindings.ts';

export interface RebindResult {
  bindings: Keybindings;
  // Other actions whose binding was cleared because they held the new value.
  unbound: KeybindingAction[];
}

// Assign `value` to `action`, applying the "warn + unbind other" conflict rule:
// any *other* action currently holding `value` is set to null. Keys (strings)
// and mouse buttons (numbers) live in separate value spaces, so a `===` compare
// never crosses them. Pure — returns a new object, leaving the input untouched.
export function applyBinding(
  bindings: Keybindings,
  action: KeybindingAction,
  value: string | number,
): RebindResult {
  const next = { ...bindings };
  const unbound: KeybindingAction[] = [];

  for (const other of Object.keys(next) as KeybindingAction[]) {
    if (other !== action && next[other] === value) {
      next[other] = null as never;
      unbound.push(other);
    }
  }

  next[action] = value as never;
  return { bindings: next, unbound };
}
