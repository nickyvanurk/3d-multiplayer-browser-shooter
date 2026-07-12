// Keybindings are the single source of truth for every user-facing control.
// Keyboard actions store a KeyboardEvent.code (or null when unbound); the two
// weapon/fire actions store a MouseEvent.button index (or null). Keeping them in
// one map lets the Controls screen rebind everything and the input path / HUDs
// read the live values.
export interface Keybindings {
  forward: string | null;
  backward: string | null;
  rollLeft: string | null;
  rollRight: string | null;
  strafeLeft: string | null;
  strafeRight: string | null;
  strafeUp: string | null;
  strafeDown: string | null;
  boost: string | null;
  weaponPrimary: number | null;
  weaponSecondary: number | null;
  cameraOrbit: string | null;
  shopToggle: string | null;
  musicPrev: string | null;
  musicNext: string | null;
  musicVolUp: string | null;
  musicVolDown: string | null;
  musicPlayPause: string | null;
  musicPanelToggle: string | null;
}

export type KeybindingAction = keyof Keybindings;

export const DEFAULT_KEYBINDINGS: Keybindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  rollLeft: 'KeyQ',
  rollRight: 'KeyE',
  strafeLeft: 'KeyA',
  strafeRight: 'KeyD',
  strafeUp: 'Space',
  strafeDown: 'KeyC',
  boost: 'ShiftLeft',
  weaponPrimary: 0,
  weaponSecondary: 2, // right mouse button
  cameraOrbit: 'AltLeft',
  shopToggle: 'KeyF',
  musicPrev: 'ArrowLeft',
  musicNext: 'ArrowRight',
  musicVolUp: 'ArrowUp',
  musicVolDown: 'ArrowDown',
  musicPlayPause: 'KeyP',
  musicPanelToggle: 'KeyM',
};

// Which actions bind to a mouse button rather than a keyboard key. Used by the
// conflict resolver (values never collide across the two spaces) and the
// Controls UI (mouse rows capture clicks, key rows capture keys).
export const MOUSE_ACTIONS: ReadonlySet<KeybindingAction> =
  new Set<KeybindingAction>(['weaponPrimary', 'weaponSecondary']);

export interface KeybindingDescriptor {
  action: KeybindingAction;
  label: string;
  group: string;
  kind: 'key' | 'mouse';
}

// Declarative layout for the Controls screen: order + grouping + display label.
export const KEYBINDING_LAYOUT: readonly KeybindingDescriptor[] = [
  {
    group: 'Movement',
    action: 'forward',
    label: 'Thrust forward',
    kind: 'key',
  },
  {
    group: 'Movement',
    action: 'backward',
    label: 'Thrust backward',
    kind: 'key',
  },
  {
    group: 'Movement',
    action: 'strafeLeft',
    label: 'Strafe left',
    kind: 'key',
  },
  {
    group: 'Movement',
    action: 'strafeRight',
    label: 'Strafe right',
    kind: 'key',
  },
  { group: 'Movement', action: 'strafeUp', label: 'Strafe up', kind: 'key' },
  {
    group: 'Movement',
    action: 'strafeDown',
    label: 'Strafe down',
    kind: 'key',
  },
  { group: 'Movement', action: 'rollLeft', label: 'Roll left', kind: 'key' },
  { group: 'Movement', action: 'rollRight', label: 'Roll right', kind: 'key' },
  { group: 'Movement', action: 'boost', label: 'Boost', kind: 'key' },
  {
    group: 'Combat',
    action: 'weaponPrimary',
    label: 'Primary fire',
    kind: 'mouse',
  },
  {
    group: 'Combat',
    action: 'weaponSecondary',
    label: 'Secondary fire',
    kind: 'mouse',
  },
  {
    group: 'Camera',
    action: 'cameraOrbit',
    label: 'Free-look (hold)',
    kind: 'key',
  },
  {
    group: 'Interface',
    action: 'shopToggle',
    label: 'Open shop (docked)',
    kind: 'key',
  },
  {
    group: 'Music',
    action: 'musicPanelToggle',
    label: 'Show / hide player',
    kind: 'key',
  },
  {
    group: 'Music',
    action: 'musicPlayPause',
    label: 'Play / pause',
    kind: 'key',
  },
  { group: 'Music', action: 'musicPrev', label: 'Previous track', kind: 'key' },
  { group: 'Music', action: 'musicNext', label: 'Next track', kind: 'key' },
  { group: 'Music', action: 'musicVolUp', label: 'Volume up', kind: 'key' },
  { group: 'Music', action: 'musicVolDown', label: 'Volume down', kind: 'key' },
];

// Merge a persisted (possibly partial / older-schema) binding blob over the
// defaults so newly-added actions always get a default and unknown keys are
// dropped. A persisted null is preserved (an intentionally unbound action).
export function mergeKeybindings(saved: unknown): Keybindings {
  const merged = { ...DEFAULT_KEYBINDINGS };
  if (!saved || typeof saved !== 'object') {
    return merged;
  }
  const partial = saved as Record<string, unknown>;
  for (const action of Object.keys(merged) as KeybindingAction[]) {
    if (!(action in partial)) {
      continue;
    }
    const value = partial[action];
    const wantsMouse = MOUSE_ACTIONS.has(action);
    if (value === null) {
      merged[action] = null as never;
    } else if (wantsMouse && typeof value === 'number') {
      merged[action] = value as never;
    } else if (!wantsMouse && typeof value === 'string') {
      merged[action] = value as never;
    }
  }
  return merged;
}
