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
  weaponSecondary?: boolean;
  aim?: Aim | null;
}

// Bit positions for packing the movement command into a single integer for the
// wire. Aim/weapon are excluded: aim is implicit in the replicated rotation and
// weapon fire is its own message. The set replicated is what drives remote
// engine effects now and feeds dead-reckoning (control -> acceleration) later.
export const InputBits = {
  forward: 1 << 0,
  backward: 1 << 1,
  strafeLeft: 1 << 2,
  strafeRight: 1 << 3,
  strafeUp: 1 << 4,
  strafeDown: 1 << 5,
  rollLeft: 1 << 6,
  rollRight: 1 << 7,
  boost: 1 << 8,
} as const;

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
  weaponSecondary!: boolean;
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
        weaponSecondary: false,
        aim: null,
      },
      data,
    );
    this.seq = seq;
  }

  static empty(): InputCommand {
    return new InputCommand();
  }

  // True when any translational thrust direction is held. Boost alone is NOT
  // thrust — it only scales an existing direction — so it is excluded. Drives
  // remote dead-reckoning: a thrusting ship is held against damping by a drive
  // force the mirror doesn't reproduce, so its body must coast undamped.
  hasLinearThrust(): boolean {
    return (
      this.forward ||
      this.backward ||
      this.strafeLeft ||
      this.strafeRight ||
      this.strafeUp ||
      this.strafeDown
    );
  }

  // Pack the movement command into one integer for replication.
  toBits(): number {
    return (
      (this.forward ? InputBits.forward : 0) |
      (this.backward ? InputBits.backward : 0) |
      (this.strafeLeft ? InputBits.strafeLeft : 0) |
      (this.strafeRight ? InputBits.strafeRight : 0) |
      (this.strafeUp ? InputBits.strafeUp : 0) |
      (this.strafeDown ? InputBits.strafeDown : 0) |
      (this.rollLeft ? InputBits.rollLeft : 0) |
      (this.rollRight ? InputBits.rollRight : 0) |
      (this.boost ? InputBits.boost : 0)
    );
  }

  // Overwrite the movement flags from a packed integer (weapon/aim untouched).
  applyBits(bits: number): this {
    this.forward = (bits & InputBits.forward) !== 0;
    this.backward = (bits & InputBits.backward) !== 0;
    this.strafeLeft = (bits & InputBits.strafeLeft) !== 0;
    this.strafeRight = (bits & InputBits.strafeRight) !== 0;
    this.strafeUp = (bits & InputBits.strafeUp) !== 0;
    this.strafeDown = (bits & InputBits.strafeDown) !== 0;
    this.rollLeft = (bits & InputBits.rollLeft) !== 0;
    this.rollRight = (bits & InputBits.rollRight) !== 0;
    this.boost = (bits & InputBits.boost) !== 0;
    return this;
  }

  static fromBits(bits: number): InputCommand {
    return new InputCommand().applyBits(bits);
  }
}
