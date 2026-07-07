// Default keybindings (ported from game.js handleConnect + components/keybindings.js).
// Movement keys are KeyboardEvent.code values; weaponPrimary is a MouseEvent.button index.
export const DEFAULT_KEYBINDINGS = {
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
