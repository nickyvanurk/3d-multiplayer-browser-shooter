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
  miningFactor: number | undefined;

  constructor(
    position: Vector3,
    rotation: Quaternion,
    damage: number,
    bulletId: number,
    miningFactor?: number,
  ) {
    this.position = position;
    this.rotation = rotation;
    this.damage = damage;
    this.bulletId = bulletId;
    this.miningFactor = miningFactor;
  }

  static deserialize(message: number[]) {
    return {
      position: new Vector3(message[0], message[1], message[2]),
      rotation: new Quaternion(message[3], message[4], message[5], message[6]),
      damage: message[7],
      bulletId: message[8],
      // Optional trailing slot: 0/absent means "no override" (ordinary cannon
      // fire falls back to the global mining factor), so map it to undefined.
      miningFactor: message[9] || undefined,
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
      this.miningFactor ?? 0,
    ];
  }
}

// Client -> server: a clock-sync probe carrying the client's performance.now()
// at send. The server echoes it back in a Pong.
export class Ping {
  sentTime: number;

  constructor(sentTime: number) {
    this.sentTime = sentTime;
  }

  static deserialize(message: number[]) {
    return { sentTime: message[0] };
  }

  serialize() {
    return [Types.Messages.PING, this.sentTime];
  }
}

// Server -> client: the echoed client send time plus the server's clock at
// reply. The client computes latency + clock delta from (sentTime, serverTime,
// receiveTime).
export class Pong {
  sentTime: number;
  serverTime: number;

  constructor(sentTime: number, serverTime: number) {
    this.sentTime = sentTime;
    this.serverTime = serverTime;
  }

  static deserialize(message: number[]) {
    return { sentTime: message[0], serverTime: message[1] };
  }

  serialize() {
    return [Types.Messages.PONG, this.sentTime, this.serverTime];
  }
}

class World {
  entities: WorldStateEntry[];
  serverTime: number;

  constructor(entities: WorldStateEntry[], serverTime: number) {
    this.entities = entities;
    this.serverTime = serverTime;
  }

  static deserialize(message: number[]) {
    const serverTime = message[0];
    const entities: {
      id: number;
      position: Vector3;
      rotation: Quaternion;
      velocity: Vector3;
      angularVelocity: Vector3;
      input: number;
      health: number;
    }[] = [];

    // After the serverTime prefix: 16 numbers per entity (id + 15 network-state
    // values; the last two are the packed input bitmask and health).
    for (let i = 1; i < message.length; i += 16) {
      entities.push({
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

    return { serverTime, entities };
  }

  serialize() {
    const data: number[] = [Types.Messages.WORLD, this.serverTime];

    for (const { id, state } of this.entities) {
      data.push(id, ...state);
    }

    return data;
  }
}

// Server -> all clients: an ore chunk broke off at `position` (the shot's impact
// point). Its position can't be re-derived client-side, so the server sends it;
// clients render a chunk with this id there.
export class OreDrop {
  id: number;
  position: Vector3;

  constructor(id: number, position: Vector3) {
    this.id = id;
    this.position = position;
  }

  static deserialize(message: number[]) {
    return {
      id: message[0],
      position: new Vector3(message[1], message[2], message[3]),
    };
  }

  serialize() {
    return [
      Types.Messages.OREDROP,
      this.id,
      this.position.x,
      this.position.y,
      this.position.z,
    ];
  }
}

// Server -> all clients: an ore chunk was collected authoritatively, so every
// client removes its copy. Keyed by the chunk's unique id (from OreDrop).
export class Collect {
  id: number;

  constructor(id: number) {
    this.id = id;
  }

  static deserialize(message: number[]) {
    return { id: message[0] };
  }

  serialize() {
    return [Types.Messages.COLLECT, this.id];
  }
}

// Client -> server: "sell my whole hold at the vendor." No payload — the server
// knows the ship from the connection and validates docking range itself.
export class Sell {
  constructor() {}

  static deserialize(): void {}

  serialize() {
    return [Types.Messages.SELL];
  }
}

// Client -> server: "repair my hull at the vendor." No payload; server-validated.
export class Repair {
  constructor() {}

  static deserialize(): void {}

  serialize() {
    return [Types.Messages.REPAIR];
  }
}

// Server -> owner only: the owning client's cargo/credits after a change. Kept
// off the shared broadcast snapshot — only the owner's HUD needs these.
export class Stats {
  cargo: number;
  cargoCapacity: number;
  credits: number;

  constructor(cargo: number, cargoCapacity: number, credits: number) {
    this.cargo = cargo;
    this.cargoCapacity = cargoCapacity;
    this.credits = credits;
  }

  static deserialize(message: number[]) {
    return {
      cargo: message[0],
      cargoCapacity: message[1],
      credits: message[2],
    };
  }

  serialize() {
    return [Types.Messages.STATS, this.cargo, this.cargoCapacity, this.credits];
  }
}

// Client -> server: "buy this item at the vendor." Server knows the ship from the
// connection and validates docking range + funds itself.
export class Buy {
  itemId: number;

  constructor(itemId: number) {
    this.itemId = itemId;
  }

  static deserialize(message: number[]) {
    return { itemId: message[0] };
  }

  serialize() {
    return [Types.Messages.BUY, this.itemId];
  }
}

// Client -> server: mount `itemId` in `slot` (0 = primary, 1 = secondary), or
// itemId -1 to unequip that slot.
export class Equip {
  slot: number;
  itemId: number;

  constructor(slot: number, itemId: number) {
    this.slot = slot;
    this.itemId = itemId;
  }

  static deserialize(message: number[]) {
    return { slot: message[0], itemId: message[1] };
  }

  serialize() {
    return [Types.Messages.EQUIP, this.slot, this.itemId];
  }
}

// Server -> owner only: item ownership + the item in each weapon slot, after a
// buy/equip. Credits are NOT here — they ride the Stats message — so a credit-only
// change never triggers a client weapon rebuild. Kept off the shared snapshot.
export class Loadout {
  hasMiningLaser: boolean;
  primaryItem: number;
  secondaryItem: number;

  constructor(
    hasMiningLaser: boolean,
    primaryItem: number,
    secondaryItem: number,
  ) {
    this.hasMiningLaser = hasMiningLaser;
    this.primaryItem = primaryItem;
    this.secondaryItem = secondaryItem;
  }

  static deserialize(message: number[]) {
    return {
      hasMiningLaser: !!message[0],
      primaryItem: message[1],
      secondaryItem: message[2],
    };
  }

  serialize() {
    return [
      Types.Messages.LOADOUT,
      this.hasMiningLaser ? 1 : 0,
      this.primaryItem,
      this.secondaryItem,
    ];
  }
}

export default {
  Go,
  Hello,
  Welcome,
  Spawn,
  Despawn,
  State,
  Fire,
  World,
  OreDrop,
  Collect,
  Sell,
  Repair,
  Stats,
  Buy,
  Equip,
  Loadout,
  Ping,
  Pong,
};
