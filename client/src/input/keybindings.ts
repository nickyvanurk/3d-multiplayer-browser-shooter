// Default keybindings (ported from game.js handleConnect + components/keybindings.js).
// Movement keys are KeyboardEvent.code values; weaponPrimary is a MouseEvent.button index.
export interface Keybindings {
  forward: string;
  backward: string;
  rollLeft: string;
  rollRight: string;
  strafeLeft: string;
  strafeRight: string;
  strafeUp: string;
  strafeDown: string;
  boost: string;
  weaponPrimary: number;
  weaponSecondary: number;
}

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
};
