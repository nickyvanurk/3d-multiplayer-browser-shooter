import { Vector3, Quaternion } from 'three';

import Types from './types.js';
import type { EntityKind } from './types.js';
import type { Aim, InputCommandData } from './sim/input.js';

// One replicated entity in a World snapshot: its id plus the 7-number network
// state (position xyz + rotation xyzw) produced by Entity.serializeNetworkState.
interface WorldStateEntry {
  id: number;
  state: number[];
}

class Go {
  constructor() {}

  static deserialize(): void {}

  serialize() {
    return [Types.Messages.GO];
  }
}

class Hello {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  static deserialize(message: string[]) {
    return { name: message[0] };
  }

  serialize() {
    return [Types.Messages.HELLO, this.name];
  }
}

class Welcome {
  id: number;
  name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  static deserialize(message: [number, string]) {
    return {
      id: message[0],
      name: message[1],
    };
  }

  serialize() {
    return [Types.Messages.WELCOME, this.id, this.name];
  }
}

export class Spawn {
  id: number;
  kind: EntityKind;
  position: Vector3;
  rotation: Quaternion;
  scale: number;

  constructor(
    id: number,
    kind: EntityKind,
    position: Vector3,
    rotation: Quaternion,
    scale: number,
  ) {
    this.id = id;
    this.kind = kind;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }

  static deserialize(message: number[]) {
    return {
      id: message[0],
      kind: message[1],
      position: new Vector3(message[2], message[3], message[4]),
      rotation: new Quaternion(message[5], message[6], message[7], message[8]),
      scale: message[9],
    };
  }

  serialize() {
    return [
      Types.Messages.SPAWN,
      this.id,
      this.kind,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
      this.rotation.w,
      this.scale,
    ];
  }
}

export class Despawn {
  id: number;

  constructor(id: number) {
    this.id = id;
  }

  static deserialize(message: number[]) {
    return { id: message[0] };
  }

  serialize() {
    return [Types.Messages.DESPAWN, this.id];
  }
}

export class Input {
  forward: boolean | undefined;
  backward: boolean | undefined;
  rollLeft: boolean | undefined;
  rollRight: boolean | undefined;
  strafeLeft: boolean | undefined;
  strafeRight: boolean | undefined;
  strafeUp: boolean | undefined;
  strafeDown: boolean | undefined;
  boost: boolean | undefined;
  weaponPrimary: boolean | undefined;
  aim: Aim | null | undefined;

  constructor(input: InputCommandData) {
    const {
      forward,
      backward,
      rollLeft,
      rollRight,
      strafeLeft,
      strafeRight,
      strafeUp,
      strafeDown,
      boost,
      weaponPrimary,
      aim,
    } = input;

    this.forward = forward;
    this.backward = backward;
    this.rollLeft = rollLeft;
    this.rollRight = rollRight;
    this.strafeLeft = strafeLeft;
    this.strafeRight = strafeRight;
    this.strafeUp = strafeUp;
    this.strafeDown = strafeDown;
    this.boost = boost;
    this.weaponPrimary = weaponPrimary;
    this.aim = aim;
  }

  static deserialize(
    message: [
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      Aim,
    ],
  ) {
    return {
      forward: message[0],
      backward: message[1],
      rollLeft: message[2],
      rollRight: message[3],
      strafeLeft: message[4],
      strafeRight: message[5],
      strafeUp: message[6],
      strafeDown: message[7],
      boost: message[8],
      weaponPrimary: message[9],
      aim: message[10],
    };
  }

  serialize() {
    return [
      Types.Messages.INPUT,
      this.forward,
      this.backward,
      this.rollLeft,
      this.rollRight,
      this.strafeLeft,
      this.strafeRight,
      this.strafeUp,
      this.strafeDown,
      this.boost,
      this.weaponPrimary,
      this.aim,
    ];
  }
}

class World {
  entities: WorldStateEntry[];

  constructor(entities: WorldStateEntry[]) {
    this.entities = entities;
  }

  static deserialize(message: number[]) {
    const data: { id: number; position: Vector3; rotation: Quaternion }[] = [];

    for (let i = 0; i < message.length; i += 8) {
      data.push({
        id: message[i],
        position: new Vector3(message[i + 1], message[i + 2], message[i + 3]),
        rotation: new Quaternion(
          message[i + 4],
          message[i + 5],
          message[i + 6],
          message[i + 7],
        ),
      });
    }

    return data;
  }

  serialize() {
    const data: number[] = [Types.Messages.WORLD];

    for (const { id, state } of this.entities) {
      data.push(
        id,
        state[0],
        state[1],
        state[2],
        state[3],
        state[4],
        state[5],
        state[6],
      );
    }

    return data;
  }
}

export default { Go, Hello, Welcome, Spawn, Despawn, Input, World };
