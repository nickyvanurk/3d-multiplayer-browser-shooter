// shared/sim/input.js
export interface Aim {
  mouse: { x: number; y: number };
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  distance: number;
}

export interface InputCommandData {
  forward?: boolean;
  backward?: boolean;
  rollLeft?: boolean;
  rollRight?: boolean;
  strafeLeft?: boolean;
  strafeRight?: boolean;
  strafeUp?: boolean;
  strafeDown?: boolean;
  boost?: boolean;
  weaponPrimary?: boolean;
  aim?: Aim | null;
}

export class InputCommand {
  forward!: boolean;
  backward!: boolean;
  rollLeft!: boolean;
  rollRight!: boolean;
  strafeLeft!: boolean;
  strafeRight!: boolean;
  strafeUp!: boolean;
  strafeDown!: boolean;
  boost!: boolean;
  weaponPrimary!: boolean;
  aim!: Aim | null;
  seq: number;

  constructor(data: InputCommandData = {}, seq = 0) {
    Object.assign(
      this,
      {
        forward: false,
        backward: false,
        rollLeft: false,
        rollRight: false,
        strafeLeft: false,
        strafeRight: false,
        strafeUp: false,
        strafeDown: false,
        boost: false,
        weaponPrimary: false,
        aim: null,
      },
      data,
    );
    this.seq = seq;
  }

  static empty(): InputCommand {
    return new InputCommand();
  }
}
