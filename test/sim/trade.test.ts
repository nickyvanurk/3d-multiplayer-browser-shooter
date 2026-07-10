import assert from 'node:assert/strict';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Vendor } from '../../shared/sim/entities/vendor.ts';
import {
  sellCargo,
  repairShip,
  inTradeRange,
  SHIP_MAX_HEALTH,
} from '../../shared/sim/trade.ts';
import {
  ORE_SELL_PRICE,
  REPAIR_COST,
  VENDOR_TRADE_RADIUS,
} from '../../shared/sim/mining.ts';
import { test } from './harness.ts';

function shipAt(x: number): Ship {
  const s = new Ship();
  s.transform.position.set(x, 0, 0);
  return s;
}

function vendorAtOrigin(): Vendor {
  const v = new Vendor();
  v.transform.position.set(0, 0, 0);
  return v;
}

test('inTradeRange is true inside VENDOR_TRADE_RADIUS and false beyond it', () => {
  const vendor = vendorAtOrigin();
  assert.equal(inTradeRange(shipAt(VENDOR_TRADE_RADIUS - 1), vendor), true);
  assert.equal(inTradeRange(shipAt(VENDOR_TRADE_RADIUS + 1), vendor), false);
});

test('selling in range converts the whole hold to credits and empties it', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.cargo = 7;
  ship.credits = 3;

  const earned = sellCargo(ship, vendor);

  assert.equal(earned, 7 * ORE_SELL_PRICE);
  assert.equal(ship.cargo, 0);
  assert.equal(ship.credits, 3 + 7 * ORE_SELL_PRICE);
});

test('selling out of range is rejected and changes nothing', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(VENDOR_TRADE_RADIUS + 100);
  ship.cargo = 7;

  const earned = sellCargo(ship, vendor);

  assert.equal(earned, 0);
  assert.equal(ship.cargo, 7);
  assert.equal(ship.credits, 0);
});

test('selling an empty hold is a no-op', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.cargo = 0;

  assert.equal(sellCargo(ship, vendor), 0);
  assert.equal(ship.credits, 0);
});

test('repair in range with funds restores full health for REPAIR_COST', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.health = 40;
  ship.credits = REPAIR_COST + 5;

  const ok = repairShip(ship, vendor);

  assert.equal(ok, true);
  assert.equal(ship.health, SHIP_MAX_HEALTH);
  assert.equal(ship.credits, 5);
});

test('repair is rejected without enough credits', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.health = 40;
  ship.credits = REPAIR_COST - 1;

  assert.equal(repairShip(ship, vendor), false);
  assert.equal(ship.health, 40);
  assert.equal(ship.credits, REPAIR_COST - 1);
});

test('repair is rejected at full health (no wasted credits)', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.health = SHIP_MAX_HEALTH;
  ship.credits = 999;

  assert.equal(repairShip(ship, vendor), false);
  assert.equal(ship.credits, 999);
});

test('repair is rejected out of range', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(VENDOR_TRADE_RADIUS + 100);
  ship.health = 40;
  ship.credits = 999;

  assert.equal(repairShip(ship, vendor), false);
  assert.equal(ship.health, 40);
  assert.equal(ship.credits, 999);
});
