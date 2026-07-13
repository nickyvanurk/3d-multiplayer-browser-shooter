import { Vector3, Quaternion } from 'three';

import Types from './types.ts';
import type { EntityKind } from './types.ts';
import { BitWriter, BitReader } from './sim/net/bitpack.ts';
import {
  POSITION_BITS,
  QUAT_COMPONENT_BITS,
  VELOCITY_BITS,
  VELOCITY_RANGE,
  ANGULAR_VELOCITY_RANGE,
  quantizeState,
  dequantizeState,
} from './sim/net/quantize.ts';

// One replicated entity in a World snapshot: its id plus the 16 quantized integer
// buckets produced by quantizeState (position, smallest-three quaternion,
// velocity, angular velocity, then input/health/level).
interface WorldStateEntry {
  id: number;
  state: number[];
}

// Binary snapshot field widths (bits). Pose messages (World, State) bit-pack the
// quantized buckets; every other message stays JSON.
const TAG_BITS = 8;
const ID_BITS = 16;
const QUAT_INDEX_BITS = 2;
const INPUT_BITS = 16;
const HEALTH_BITS = 16;
const LEVEL_BITS = 8;

// Write the 14 physics slots of a quantized state (pos, quaternion, velocity,
// angular velocity, input) MSB-first. Shared by World (per entity) and State.
function writePhysics(w: BitWriter, s: number[]): void {
  w.writeBits(s[0], POSITION_BITS);
  w.writeBits(s[1], POSITION_BITS);
  w.writeBits(s[2], POSITION_BITS);
  w.writeBits(s[3], QUAT_INDEX_BITS);
  w.writeBits(s[4], QUAT_COMPONENT_BITS);
  w.writeBits(s[5], QUAT_COMPONENT_BITS);
  w.writeBits(s[6], QUAT_COMPONENT_BITS);
  for (let i = 7; i <= 12; i++) {
    w.writeBits(s[i], VELOCITY_BITS);
  }
  w.writeBits(s[13], INPUT_BITS);
}

// Read the 14 physics slots back as quantized integer buckets.
function readPhysics(r: BitReader): number[] {
  const s = [
    r.readBits(POSITION_BITS),
    r.readBits(POSITION_BITS),
    r.readBits(POSITION_BITS),
    r.readBits(QUAT_INDEX_BITS),
    r.readBits(QUAT_COMPONENT_BITS),
    r.readBits(QUAT_COMPONENT_BITS),
    r.readBits(QUAT_COMPONENT_BITS),
  ];
  for (let i = 7; i <= 12; i++) {
    s.push(r.readBits(VELOCITY_BITS));
  }
  s.push(r.readBits(INPUT_BITS));
  return s;
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

  static deserialize(bytes: Uint8Array) {
    const r = new BitReader(bytes);
    r.readBits(TAG_BITS);
    const d = dequantizeState([...readPhysics(r), 0, 0]);
    return {
      position: d.position,
      rotation: d.rotation,
      velocity: d.velocity,
      angularVelocity: d.angularVelocity,
      input: d.input,
    };
  }

  serialize(): Uint8Array {
    const w = new BitWriter();
    w.writeBits(Types.Messages.STATE, TAG_BITS);
    writePhysics(
      w,
      quantizeState([
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
        0,
        0,
      ]),
    );
    return w.bytes();
  }
}

// Client -> server: "I fired." Bullets no longer exist server-side, so this is
// purely the muzzle {transform, speed} the server relays to OTHER clients (as a
// Shot) to reproduce the cosmetic tracer. Damage is reported separately via Hit.
export class Fire {
  position: Vector3;
  rotation: Quaternion;
  speed: number;

  constructor(position: Vector3, rotation: Quaternion, speed: number) {
    this.position = position;
    this.rotation = rotation;
    this.speed = speed;
  }

  static deserialize(message: number[]) {
    return {
      position: new Vector3(message[0], message[1], message[2]),
      rotation: new Quaternion(message[3], message[4], message[5], message[6]),
      speed: message[7],
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
      this.speed,
    ];
  }
}

// Server -> other clients: a relayed shot the shooter's client already predicts
// locally. `shooterId` lets the receiver own the tracer to that ship (so its own
// raycast excludes it). The tracer is cosmetic everywhere; damage is authoritative
// only through the shooter's Hit.
export class Shot {
  shooterId: number;
  position: Vector3;
  rotation: Quaternion;
  speed: number;

  constructor(
    shooterId: number,
    position: Vector3,
    rotation: Quaternion,
    speed: number,
  ) {
    this.shooterId = shooterId;
    this.position = position;
    this.rotation = rotation;
    this.speed = speed;
  }

  static deserialize(message: number[]) {
    return {
      shooterId: message[0],
      position: new Vector3(message[1], message[2], message[3]),
      rotation: new Quaternion(message[4], message[5], message[6], message[7]),
      speed: message[8],
    };
  }

  serialize() {
    return [
      Types.Messages.SHOT,
      this.shooterId,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
      this.rotation.w,
      this.speed,
    ];
  }
}

// Client -> server: "my shot hit entity `targetId` at `position`, for `damage`."
// Client-side hit detection: the shooter's raycast found the hit; the server
// validates (clamps damage to the ship's real weapons, gates the mining factor on
// laser ownership, range-checks the impact) and applies it. `position` is the
// impact point, used to break ore off asteroids where the shot landed.
export class Hit {
  targetId: number;
  damage: number;
  position: Vector3;
  miningFactor: number | undefined;

  constructor(
    targetId: number,
    damage: number,
    position: Vector3,
    miningFactor?: number,
  ) {
    this.targetId = targetId;
    this.damage = damage;
    this.position = position;
    this.miningFactor = miningFactor;
  }

  static deserialize(message: number[]) {
    return {
      targetId: message[0],
      damage: message[1],
      // 0/absent means "no override" (cannon fire → default mining factor).
      miningFactor: message[2] || undefined,
      position: new Vector3(message[3], message[4], message[5]),
    };
  }

  serialize() {
    return [
      Types.Messages.HIT,
      this.targetId,
      this.damage,
      this.miningFactor ?? 0,
      this.position.x,
      this.position.y,
      this.position.z,
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
  // The same World object is pushed to every connection; cache the bit-packed
  // frame so it is encoded once per tick, not once per client.
  private encoded: Uint8Array | null;

  constructor(entities: WorldStateEntry[], serverTime: number) {
    this.entities = entities;
    this.serverTime = serverTime;
    this.encoded = null;
  }

  static deserialize(bytes: Uint8Array) {
    const r = new BitReader(bytes);
    r.readBits(TAG_BITS);
    const serverTime = r.readFloat64();
    const count = r.readBits(ID_BITS);

    const entities: {
      id: number;
      position: Vector3;
      rotation: Quaternion;
      velocity: Vector3;
      angularVelocity: Vector3;
      input: number;
      health: number;
      level: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const id = r.readBits(ID_BITS);
      const physics = readPhysics(r);
      const health = r.readBits(HEALTH_BITS);
      const level = r.readBits(LEVEL_BITS);
      const d = dequantizeState([...physics, health, level]);
      entities.push({
        id,
        position: d.position,
        rotation: d.rotation,
        velocity: d.velocity,
        angularVelocity: d.angularVelocity,
        input: d.input,
        health,
        level,
      });
    }

    return { serverTime, entities };
  }

  serialize(): Uint8Array {
    if (this.encoded) {
      return this.encoded;
    }
    const w = new BitWriter();
    w.writeBits(Types.Messages.WORLD, TAG_BITS);
    w.writeFloat64(this.serverTime);
    w.writeBits(this.entities.length, ID_BITS);
    for (const { id, state } of this.entities) {
      w.writeBits(id, ID_BITS);
      writePhysics(w, state);
      w.writeBits(state[14], HEALTH_BITS);
      w.writeBits(state[15], LEVEL_BITS);
    }
    this.encoded = w.bytes();
    return this.encoded;
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

// Server -> owner only: the owner's progression after a kill or a respawn reset.
// Change-tracked like Stats — kept off the shared snapshot, only the owner's HUD
// needs it. `xpForNext` is the XP cost of the current level so the bar can show
// xp/xpForNext without duplicating the curve on the client.
export class Progress {
  level: number;
  xp: number;
  xpForNext: number;

  constructor(level: number, xp: number, xpForNext: number) {
    this.level = level;
    this.xp = xp;
    this.xpForNext = xpForNext;
  }

  static deserialize(message: number[]) {
    return {
      level: message[0],
      xp: message[1],
      xpForNext: message[2],
    };
  }

  serialize() {
    return [Types.Messages.PROGRESS, this.level, this.xp, this.xpForNext];
  }
}

// One ranked pilot on the leaderboard: display name + current level.
export interface LeaderboardEntry {
  name: string;
  level: number;
}

// Server -> each client (throttled): the top-ranked pilots plus the recipient's
// own standing, so a client outside the top N still knows its number. Tailored per
// recipient (selfRank/selfLevel differ), hence not a shared broadcast. Wire layout:
// [selfRank, selfLevel, name0, level0, name1, level1, ...] — mixed string/number,
// which the JSON transport carries fine (see Spawn).
export class Leaderboard {
  entries: LeaderboardEntry[];
  selfRank: number;
  selfLevel: number;

  constructor(
    entries: LeaderboardEntry[],
    selfRank: number,
    selfLevel: number,
  ) {
    this.entries = entries;
    this.selfRank = selfRank;
    this.selfLevel = selfLevel;
  }

  static deserialize(message: (number | string)[]) {
    const selfRank = message[0] as number;
    const selfLevel = message[1] as number;
    const entries: LeaderboardEntry[] = [];
    for (let i = 2; i + 1 < message.length; i += 2) {
      entries.push({
        name: message[i] as string,
        level: message[i + 1] as number,
      });
    }
    return { entries, selfRank, selfLevel };
  }

  serialize() {
    const data: (number | string)[] = [
      Types.Messages.LEADERBOARD,
      this.selfRank,
      this.selfLevel,
    ];
    for (const { name, level } of this.entries) {
      data.push(name, level);
    }
    return data;
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
  Shot,
  Hit,
  World,
  OreDrop,
  Collect,
  Sell,
  Repair,
  Stats,
  Buy,
  Equip,
  Loadout,
  Progress,
  Leaderboard,
  Ping,
  Pong,
};
