import type { Vector3 } from 'three';
import {
  ORE_SELL_PRICE,
  REPAIR_COST,
  VENDOR_TRADE_RADIUS,
  MINING_LASER_PRICE,
  Items,
  Slots,
} from './mining.ts';

// Full ship hull, matching Ship's constructor default and the respawn heal. The
// vendor repairs back up to exactly this.
export const SHIP_MAX_HEALTH = 100;

// The trade-relevant view of the two parties: a ship carrying the economy fields
// and any entity with a world position to trade against (the vendor).
interface Trader {
  transform: { position: Vector3 };
  cargo: number;
  credits: number;
  health: number;
  hasMiningLaser: boolean;
  primaryItem: number;
  secondaryItem: number;
}
interface TradePost {
  transform: { position: Vector3 };
}

const TRADE_RADIUS_SQ = VENDOR_TRADE_RADIUS * VENDOR_TRADE_RADIUS;

// Server-authoritative vendor trades: SELL turns the whole hold into credits,
// REPAIR spends a flat fee to restore full hull. Both are gated on the ship
// being within docking range of the vendor; the caller validates ownership.

export function inTradeRange(ship: Trader, vendor: TradePost): boolean {
  return (
    ship.transform.position.distanceToSquared(vendor.transform.position) <=
    TRADE_RADIUS_SQ
  );
}

// Sell the entire hold at the fixed ore price and empty it. Returns the credits
// earned (0 if out of range or the hold is already empty — a no-op).
export function sellCargo(ship: Trader, vendor: TradePost): number {
  if (ship.cargo <= 0 || !inTradeRange(ship, vendor)) {
    return 0;
  }
  const earned = ship.cargo * ORE_SELL_PRICE;
  ship.credits += earned;
  ship.cargo = 0;
  return earned;
}

// Restore full hull for a flat fee. Rejected (returns false, no change) out of
// range, without the funds, or when already at full health.
export function repairShip(ship: Trader, vendor: TradePost): boolean {
  if (
    ship.health >= SHIP_MAX_HEALTH ||
    ship.credits < REPAIR_COST ||
    !inTradeRange(ship, vendor)
  ) {
    return false;
  }
  ship.credits -= REPAIR_COST;
  ship.health = SHIP_MAX_HEALTH;
  return true;
}

// Buy the mining laser: spend credits and mark it owned. Rejected (returns false,
// no change) out of range, already owned, or without the funds.
export function buyMiningLaser(ship: Trader, vendor: TradePost): boolean {
  if (
    ship.hasMiningLaser ||
    ship.credits < MINING_LASER_PRICE ||
    !inTradeRange(ship, vendor)
  ) {
    return false;
  }
  ship.credits -= MINING_LASER_PRICE;
  ship.hasMiningLaser = true;
  return true;
}

// Whether the ship owns a weapon it could equip. Cannons are free on every ship;
// the mining laser must have been bought.
export function ownsItem(ship: Trader, itemId: number): boolean {
  if (itemId === Items.CANNONS) {
    return true;
  }
  if (itemId === Items.MINING_LASER) {
    return ship.hasMiningLaser;
  }
  return false;
}

// Mount `itemId` in `slot` (0 = primary, 1 = secondary), or -1 to unequip that
// slot. Any owned weapon can go in either slot; equipping a weapon that is already
// in the other slot MOVES it (a ship carries only one of each). Returns whether
// the loadout changed.
export function equipSlot(
  ship: Trader,
  slot: number,
  itemId: number,
  vendor: TradePost,
): boolean {
  if (
    !inTradeRange(ship, vendor) ||
    (slot !== Slots.PRIMARY && slot !== Slots.SECONDARY)
  ) {
    return false;
  }
  // Reject an unowned weapon; -1 (unequip) is always allowed.
  if (itemId !== -1 && !ownsItem(ship, itemId)) {
    return false;
  }

  const before = { primary: ship.primaryItem, secondary: ship.secondaryItem };

  // Moving a weapon in from the other slot empties that slot first.
  if (itemId !== -1) {
    if (slot === Slots.PRIMARY && ship.secondaryItem === itemId) {
      ship.secondaryItem = -1;
    } else if (slot === Slots.SECONDARY && ship.primaryItem === itemId) {
      ship.primaryItem = -1;
    }
  }

  if (slot === Slots.PRIMARY) {
    ship.primaryItem = itemId;
  } else {
    ship.secondaryItem = itemId;
  }

  return (
    ship.primaryItem !== before.primary ||
    ship.secondaryItem !== before.secondary
  );
}
