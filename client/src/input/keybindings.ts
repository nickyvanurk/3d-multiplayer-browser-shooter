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
}

export const DEFAULT_KEYBINDINGS: Keybindings = {
  forward: 'KeyE',
  backward: 'KeyD',
  rollLeft: 'KeyW',
  rollRight: 'KeyR',
  strafeLeft: 'KeyS',
  strafeRight: 'KeyF',
  strafeUp: 'Backspace',
  strafeDown: 'Delete',
  boost: 'ShiftLeft',
  weaponPrimary: 0,
};
