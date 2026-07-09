import { Vector3, Quaternion } from 'three';

import Types from './types.ts';
import type { EntityKind } from './types.ts';

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
  name: string;

  constructor(
    id: number,
    kind: EntityKind,
    position: Vector3,
    rotation: Quaternion,
    scale: number,
    name = '',
  ) {
    this.id = id;
    this.kind = kind;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.name = name;
  }

  // The trailing name slot is a string (ships only); everything before it is
  // numeric, so the array is mixed — the JSON transport carries that fine.
  static deserialize(message: (number | string)[]) {
    return {
      id: message[0] as number,
      kind: message[1] as number,
      position: new Vector3(
        message[2] as number,
        message[3] as number,
        message[4] as number,
      ),
      rotation: new Quaternion(
        message[5] as number,
        message[6] as number,
        message[7] as number,
        message[8] as number,
      ),
      scale: message[9] as number,
      name: (message[10] as string) ?? '',
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
      this.name,
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

// Client -> server: the local player's authoritative ship movement. The client
// owns its ship (client-authoritative), so it reports the pose+velocities it
// simulated locally; the server copies them onto its kinematic body verbatim.
export class State {
  position: Vector3;
  rotation: Quaternion;
  velocity: Vector3;
  angularVelocity: Vector3;
  input: number;

  constructor(
    position: Vector3,
    rotation: Quaternion,
    velocity: Vector3,
    angularVelocity: Vector3,
    input = 0,
  ) {
    this.position = position;
    this.rotation = rotation;
    this.velocity = velocity;
    this.angularVelocity = angularVelocity;
    this.input = input;
  }

  static deserialize(message: number[]) {
    return {
      position: new Vector3(message[0], message[1], message[2]),
      rotation: new Quaternion(message[3], message[4], message[5], message[6]),
      velocity: new Vector3(message[7], message[8], message[9]),
      angularVelocity: new Vector3(message[10], message[11], message[12]),
      input: message[13] ?? 0,
    };
  }

  serialize() {
    return [
      Types.Messages.STATE,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
      this.rotation.w,
      this.velocity.x,
      this.velocity.y,
      this.velocity.z,
      this.angularVelocity.x,
      this.angularVelocity.y,
      this.angularVelocity.z,
      this.input,
    ];
  }
}

// Client -> server: "I fired a bullet." The client already spawned a predicted
// cosmetic bullet locally (id `bulletId`, a client-range id); the server spawns
// the authoritative one at this muzzle transform and owns the resulting damage.
export class Fire {
  position: Vector3;
  rotation: Quaternion;
  damage: number;
  bulletId: number;

  constructor(
    position: Vector3,
    rotation: Quaternion,
    damage: number,
    bulletId: number,
  ) {
    this.position = position;
    this.rotation = rotation;
    this.damage = damage;
    this.bulletId = bulletId;
  }

  static deserialize(message: number[]) {
    return {
      position: new Vector3(message[0], message[1], message[2]),
      rotation: new Quaternion(message[3], message[4], message[5], message[6]),
      damage: message[7],
      bulletId: message[8],
    };
  }

  serialize() {
    return [
      Types.Messages.FIRE,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
      this.rotation.w,
      this.damage,
      this.bulletId,
    ];
  }
}

class World {
  entities: WorldStateEntry[];

  constructor(entities: WorldStateEntry[]) {
    this.entities = entities;
  }

  static deserialize(message: number[]) {
    const data: {
      id: number;
      position: Vector3;
      rotation: Quaternion;
      velocity: Vector3;
      angularVelocity: Vector3;
      input: number;
      health: number;
    }[] = [];

    // 16 numbers per entity: id + 15 network-state values (the last two are the
    // packed input bitmask and health, non-zero only for ships).
    for (let i = 0; i < message.length; i += 16) {
      data.push({
        id: message[i],
        position: new Vector3(message[i + 1], message[i + 2], message[i + 3]),
        rotation: new Quaternion(
          message[i + 4],
          message[i + 5],
          message[i + 6],
          message[i + 7],
        ),
        velocity: new Vector3(message[i + 8], message[i + 9], message[i + 10]),
        angularVelocity: new Vector3(
          message[i + 11],
          message[i + 12],
          message[i + 13],
        ),
        input: message[i + 14],
        health: message[i + 15],
      });
    }

    return data;
  }

  serialize() {
    const data: number[] = [Types.Messages.WORLD];

    for (const { id, state } of this.entities) {
      data.push(id, ...state);
    }

    return data;
  }
}

export default { Go, Hello, Welcome, Spawn, Despawn, State, Fire, World };
