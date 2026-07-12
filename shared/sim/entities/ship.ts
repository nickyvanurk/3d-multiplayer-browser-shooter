import { Vector3, Euler, Ray } from 'three';
import { Entity } from '../entity.ts';
import type { EntityWorld } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import { InputCommand } from '../input.ts';
import { Bullet } from './bullet.ts';
import Types from '../../types.ts';
import { Weapon } from '../weapon.ts';
import type { WeaponSlot } from '../weapon.ts';
import {
  DEFAULT_CARGO_CAPACITY,
  MINING_LASER_FACTOR,
  Items,
} from '../mining.ts';

export const RESPAWN_DELAY = 3000;

// A ship's allegiance, driving HUD colour/iconography (not damage rules — those
// are FFA + the invulnerable flag). Every other player/bot reads as hostile; the
// vendor is neutral. `friendly` is reserved for a future team mode.
export type Faction = 'hostile' | 'neutral' | 'friendly';

// The dual cannons. Fired on whichever slot they're mounted in (a weapon's `slot`
// picks the LMB/RMB trigger), so they can sit in either the primary or secondary
// slot. Shared so the server (authoritative bullets) and the owning client
// (predicted bullets) fire from identical mounts/timing.
export function createDefaultWeapons(
  ship: Ship,
  slot: WeaponSlot = 'primary',
): Weapon[] {
  const left = new Weapon({
    offset: new Vector3(1.3, 0.9, 5),
    delay: 160, // half of fireInterval: interleaves the two guns evenly
    fireInterval: 320,
    slot,
  });
  const right = new Weapon({
    offset: new Vector3(-1.3, 0.9, 5),
    fireInterval: 320,
    slot,
  });
  left.parent = ship;
  right.parent = ship;
  return [left, right];
}

// The mining laser: a single centre-muzzle weapon. Fires fast with negligible
// combat damage but a high mining factor, so it chips ore far quicker than the
// cannons while being a poor weapon against ships. Mountable in either slot.
export function createMiningLaser(
  ship: Ship,
  slot: WeaponSlot = 'secondary',
): Weapon {
  const laser = new Weapon({
    offset: new Vector3(0, -0.6, 5),
    fireInterval: 120,
    slot,
    damage: 1,
    miningFactor: MINING_LASER_FACTOR,
  });
  laser.parent = ship;
  return laser;
}

// Build the weapon(s) for a shop item mounted in `slot`, or none for an empty
// slot (-1). The single source of truth for turning a loadout item into weapons.
export function weaponsForItem(
  ship: Ship,
  itemId: number,
  slot: WeaponSlot,
): Weapon[] {
  if (itemId === Items.CANNONS) {
    return createDefaultWeapons(ship, slot);
  }
  if (itemId === Items.MINING_LASER) {
    return [createMiningLaser(ship, slot)];
  }
  return [];
}

// The highest per-shot damage the ship's currently-equipped weapons can deal. The
// server clamps client-reported Hit damage to this so a tampered client can't
// inflate it.
export function maxWeaponDamage(ship: Ship): number {
  let max = 0;
  for (const weapon of [
    ...weaponsForItem(ship, ship.primaryItem, 'primary'),
    ...weaponsForItem(ship, ship.secondaryItem, 'secondary'),
  ]) {
    if (weapon.damage > max) {
      max = weapon.damage;
    }
  }
  return max;
}

export interface ShipInit {
  id?: number;
  transform?: TransformInit;
}

export interface ShipController {
  lastInput: InputCommand;
  connection?: unknown;
}

export class Ship extends Entity {
  acceleration: number;
  angularAcceleration: Euler;
  health: number;
  aim: Ray | null;
  aimDistance: number;
  weapons: Weapon[];
  firingPrimary: boolean;
  firingSecondary: boolean;
  controller: ShipController | null;
  respawn: boolean;
  randomSpawn: boolean;
  respawnTimer: number;
  // Packed movement input replicated to other clients (serializeNetworkState).
  // On the server it's set from the owner's reported State; it drives remote
  // engine visuals and, later, dead reckoning.
  inputBits: number;
  // Client-only: the replicated inputBits decoded for a REMOTE ship, read by the
  // renderer. Kept off `controller` so the client sim never re-applies it as
  // thrust (that would double-integrate against the server-corrected velocity).
  renderInput: InputCommand | null;
  // Display callsign (adjective+noun). Assigned server-side on spawn and
  // replicated to clients via the Spawn message; the HUD shows it for the
  // aimed-at ship. Empty until set.
  name: string;
  // Allegiance (drives HUD colour/icon). Ships default hostile; Vendor is neutral.
  faction: Faction;
  // Combat can't damage this ship even though it carries a health value (vendor).
  invulnerable: boolean;
  // Mining economy: ore hauled in the hold (capped at cargoCapacity) and credits
  // banked at the vendor. Server-authoritative; replicated to the owner only.
  cargo: number;
  cargoCapacity: number;
  credits: number;
  // Loadout: the item id mounted in each weapon slot (-1 = empty) and whether the
  // mining laser is owned. Any owned weapon can go in either slot. The cannons are
  // owned by every ship; the mining laser is bought. Server-authoritative;
  // replicated to the owner via Loadout and persisted across respawn.
  hasMiningLaser: boolean;
  primaryItem: number;
  secondaryItem: number;
  // Kill-driven progression (server-authoritative; see shared/sim/progression.ts).
  // Current-life only: reset to level 1 / 0 xp on respawn, for players and bots
  // alike. `level` rides the world snapshot (slot [15]) so any client can show an
  // enemy's level on its nameplate; `xp` stays owner-only via the Progress message.
  // `lastHitBy` is the ship whose shot last damaged this one — the killer credited
  // when it dies, stamped by combat and read on death.
  level: number;
  xp: number;
  lastHitBy: Ship | null;

  constructor(opts: ShipInit = {}) {
    super({ ...opts, type: Types.Entities.SPACESHIP });
    this.acceleration = 3;
    this.angularAcceleration = new Euler(6, 12, 2);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.5;
    this.angularDamping = 0.99;
    this.weight = 1;
    this.kinematic = false;
    this.health = 100;
    this.aim = new Ray();
    this.aimDistance = 0;
    this.weapons = [];
    this.firingPrimary = false;
    this.firingSecondary = false;
    this.controller = null;
    this.respawn = true;
    this.randomSpawn = true;
    this.alive = true;
    this.respawnTimer = 0;
    this.inputBits = 0;
    this.renderInput = null;
    this.name = '';
    this.faction = 'hostile';
    this.invulnerable = false;
    this.cargo = 0;
    this.cargoCapacity = DEFAULT_CARGO_CAPACITY;
    this.credits = 0;
    this.hasMiningLaser = false;
    this.primaryItem = Items.CANNONS;
    this.secondaryItem = -1;
    this.level = 1;
    this.xp = 0;
    this.lastHitBy = null;
  }

  // Fill the trailing slots the base leaves at 0: the packed input (so remote
  // clients can light this ship's engine), current health (for enemy HP bars) and
  // current level (for the aimed-at enemy's nameplate).
  serializeNetworkState(): number[] {
    const state = super.serializeNetworkState();
    state[13] = this.inputBits;
    state[14] = this.health;
    state[15] = this.level;
    return state;
  }

  applyInput(input: InputCommand, dt: number): void {
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
      weaponSecondary,
      aim,
    } = input;

    const acceleration = boost ? this.acceleration * 2 : this.acceleration;

    const movement = {
      x: strafeLeft ? 1 : strafeRight ? -1 : 0,
      y: strafeDown ? -1 : strafeUp ? 1 : 0,
      z: forward ? 1 : backward ? -1 : 0,
      roll: rollLeft ? 1 : rollRight ? -1 : 0,
      yaw: aim ? aim.mouse.x : 0,
      pitch: aim ? -aim.mouse.y : 0,
    };

    this.velocity.x = acceleration * dt * movement.x;
    this.velocity.y = acceleration * dt * movement.y;
    this.velocity.z = acceleration * dt * movement.z;

    this.angularVelocity.x = this.angularAcceleration.x * dt * movement.pitch;
    this.angularVelocity.y = this.angularAcceleration.y * dt * -movement.yaw;
    this.angularVelocity.z += this.angularAcceleration.z * dt * -movement.roll;
    this.angularVelocity.z *= this.angularDamping ** dt;

    if (Math.abs(this.angularVelocity.z) < 0.000001) {
      this.angularVelocity.z = 0;
    }

    if (aim) {
      const origin = aim.origin;
      const dir = aim.direction;

      this.aim!.origin.set(origin.x, origin.y, origin.z);
      this.aim!.direction.set(dir.x, dir.y, dir.z);
      this.aimDistance = aim.distance;
    }

    this.firingPrimary = !!weaponPrimary;
    this.firingSecondary = !!weaponSecondary;
  }

  update(dt: number, world: EntityWorld, time: number): void {
    if (!this.alive) {
      return;
    }

    // Ships are dynamic in production: the owning client drives its ship from
    // input, while the server keeps a dynamic mirror it snaps to that client's
    // State (correctBody) and lets coast. A controllerless mirror just applies
    // empty input, a no-op that writeBack overwrites. The guard below only
    // catches a ship made kinematic as a static collision target (tests), which
    // must not self-simulate.
    if (this.kinematic) {
      return;
    }

    const input = this.controller?.lastInput ?? InputCommand.empty();
    this.applyInput(input, dt);

    for (const weapon of this.weapons) {
      weapon.tryFire(time, (position, rotation, damage, miningFactor) => {
        const bullet = new Bullet({
          transform: { position, rotation },
          damage,
          miningFactor,
        });
        // Set the owner BEFORE spawning so spawn hooks (client blaster SFX, remote
        // tracer raycast exclusion) already see it.
        bullet.owner = this;
        return world.spawn(bullet);
      });
    }
  }
}
