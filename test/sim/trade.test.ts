import assert from 'node:assert/strict';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Vendor } from '../../shared/sim/entities/vendor.ts';
import {
  sellCargo,
  repairShip,
  buyMiningLaser,
  equipSlot,
  inTradeRange,
  SHIP_MAX_HEALTH,
} from '../../shared/sim/trade.ts';
import {
  ORE_SELL_PRICE,
  REPAIR_COST,
  VENDOR_TRADE_RADIUS,
  MINING_LASER_PRICE,
  Items,
  Slots,
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

test('buying the mining laser in range spends credits and marks it owned', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.credits = MINING_LASER_PRICE + 30;

  assert.equal(buyMiningLaser(ship, vendor), true);
  assert.equal(ship.hasMiningLaser, true);
  assert.equal(ship.credits, 30);
});

test('buying the mining laser is rejected without enough credits', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.credits = MINING_LASER_PRICE - 1;

  assert.equal(buyMiningLaser(ship, vendor), false);
  assert.equal(ship.hasMiningLaser, false);
  assert.equal(ship.credits, MINING_LASER_PRICE - 1);
});

test('buying the mining laser twice is rejected (already owned, no double charge)', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.credits = MINING_LASER_PRICE * 2;

  assert.equal(buyMiningLaser(ship, vendor), true);
  assert.equal(buyMiningLaser(ship, vendor), false);
  assert.equal(ship.credits, MINING_LASER_PRICE);
});

test('buying the mining laser is rejected out of range', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(VENDOR_TRADE_RADIUS + 100);
  ship.credits = MINING_LASER_PRICE + 100;

  assert.equal(buyMiningLaser(ship, vendor), false);
  assert.equal(ship.hasMiningLaser, false);
  assert.equal(ship.credits, MINING_LASER_PRICE + 100);
});

test('a ship starts with cannons in primary and nothing in secondary', () => {
  const ship = shipAt(10);
  assert.equal(ship.primaryItem, Items.CANNONS);
  assert.equal(ship.secondaryItem, -1);
});

test('equipping the owned mining laser mounts it; -1 unequips it', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.hasMiningLaser = true;

  assert.equal(
    equipSlot(ship, Slots.SECONDARY, Items.MINING_LASER, vendor),
    true,
  );
  assert.equal(ship.secondaryItem, Items.MINING_LASER);
  // Re-equipping the same item in the same slot is a no-op (no change).
  assert.equal(
    equipSlot(ship, Slots.SECONDARY, Items.MINING_LASER, vendor),
    false,
  );

  assert.equal(equipSlot(ship, Slots.SECONDARY, -1, vendor), true);
  assert.equal(ship.secondaryItem, -1);
});

test('any owned weapon can go in any slot (laser in primary, cannons in secondary)', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.hasMiningLaser = true;

  assert.equal(
    equipSlot(ship, Slots.PRIMARY, Items.MINING_LASER, vendor),
    true,
  );
  assert.equal(ship.primaryItem, Items.MINING_LASER);

  assert.equal(equipSlot(ship, Slots.SECONDARY, Items.CANNONS, vendor), true);
  assert.equal(ship.secondaryItem, Items.CANNONS);
});

test('equipping a weapon already in the other slot MOVES it', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.hasMiningLaser = true;
  // Laser in secondary, then equip it into primary → it leaves secondary.
  equipSlot(ship, Slots.SECONDARY, Items.MINING_LASER, vendor);
  assert.equal(
    equipSlot(ship, Slots.PRIMARY, Items.MINING_LASER, vendor),
    true,
  );
  assert.equal(ship.primaryItem, Items.MINING_LASER);
  assert.equal(ship.secondaryItem, -1);
});

test('equipping is rejected when the mining laser is not owned', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.hasMiningLaser = false;

  assert.equal(
    equipSlot(ship, Slots.SECONDARY, Items.MINING_LASER, vendor),
    false,
  );
  assert.equal(ship.secondaryItem, -1);
});

test('the cannons can be unequipped and re-equipped (no purchase needed)', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);

  assert.equal(equipSlot(ship, Slots.PRIMARY, -1, vendor), true);
  assert.equal(ship.primaryItem, -1);

  assert.equal(equipSlot(ship, Slots.PRIMARY, Items.CANNONS, vendor), true);
  assert.equal(ship.primaryItem, Items.CANNONS);
});

test('equipping is rejected out of range', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(VENDOR_TRADE_RADIUS + 100);
  ship.hasMiningLaser = true;

  assert.equal(
    equipSlot(ship, Slots.SECONDARY, Items.MINING_LASER, vendor),
    false,
  );
  assert.equal(ship.secondaryItem, -1);
});
