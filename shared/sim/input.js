// shared/sim/input.js
export class InputCommand {
  constructor(data = {}, seq = 0) {
    Object.assign(this, {
      forward: false, backward: false,
      rollLeft: false, rollRight: false,
      strafeLeft: false, strafeRight: false, strafeUp: false, strafeDown: false,
      boost: false, weaponPrimary: false, aim: null,
    }, data);
    this.seq = seq;
  }

  static empty() { return new InputCommand(); }
}
