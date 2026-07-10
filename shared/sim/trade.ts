import type { Vector3 } from 'three';
import { ORE_SELL_PRICE, REPAIR_COST, VENDOR_TRADE_RADIUS } from './mining.ts';

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
