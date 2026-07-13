import { Vector3 } from 'three';
import Utils from '../utils.ts';

// Asteroid mining is modelled the EVE way: an asteroid is a scalar ore quantity
// (stored as the entity's `health`) that any weapon depletes. Every ORE_STEP of
// ore mined breaks off one collectible ore chunk. Unlike a pure seed model, a
// chunk spawns at the *impact point* of the shot that broke it off (the server
// sends its position), so ore appears on the face you are shooting — you can
// tuck behind a rock and mine the far side without spraying debris where others
// would spot it.

// Ore mined per collectible chunk, and the granularity of everything downstream:
// the k-th chunk breaks off (and the rock shrinks one notch) once total-mined ore
// reaches k * ORE_STEP. Kept FIXED while ORE_PER_SCALE is large, so a bigger rock
// holds proportionally more ore AND yields proportionally more chunks / shrink
// steps — a huge asteroid drops dozens, a tiny one only a handful.
export const ORE_STEP = 50;

// Ore per unit of asteroid render scale; bigger rocks hold proportionally more.
// High on purpose: an asteroid is a slab of rock, so a default gun should take a
// sustained burst (small rocks) to a couple of minutes (the biggest) to deplete.
const ORE_PER_SCALE = 30;

// Fraction of a weapon's damage that actually chips ore off a rock. Combat guns
// are lousy mining tools, so the default loadout mines SLOWLY — a chunk every few
// seconds. This is the hook for progression: vendor mining upgrades will raise a
// ship's effective factor (a dedicated mining laser >> the default blaster).
// Doesn't touch ship-vs-ship combat, only rock.
export const MINING_DAMAGE_FACTOR = 0.3;

// A dedicated mining laser mines 50% faster than the default weapon. Its bullets
// carry this factor instead of the global one above (a pure rock multiplier; the
// laser's low combat damage keeps it a poor weapon against ships).
//
// Rate derivation (ore/second, both barrels on target):
//   dual cannons  = 2 guns × (1000/320ms) × 5 dmg × 0.3   = 9.375 ore/s
//   mining laser  = 1 gun  × (1000/120ms) × 1 dmg × FACTOR = 8.333·FACTOR ore/s
// For the laser to mine 1.5× the cannons: FACTOR = 1.5 × 9.375 / 8.333 = 1.6875.
export const MINING_LASER_FACTOR = 1.6875;

// The mining laser is a short-range beam, not a projectile: it only reaches ore
// within this many world units of the muzzle (~200m). The beam is drawn from the
// muzzle to the first thing it strikes, capped here.
export const MINING_LASER_RANGE = 200;

// Shop wares / equippable weapons. Item ids are the wire currency for Buy/Equip
// messages; kept small and stable. The cannons are the default primary weapon
// (owned by every ship); the mining laser is a purchasable secondary.
export const Items = {
  MINING_LASER: 0,
  CANNONS: 1,
} as const;

// Weapon slots on the wire (Equip message). Primary is the LMB slot, secondary
// the RMB slot.
export const Slots = {
  PRIMARY: 0,
  SECONDARY: 1,
} as const;

// Vendor price of the mining laser (credits).
export const MINING_LASER_PRICE = 200;

// Cargo units a collected chunk adds to the miner's hold.
export const ORE_PER_CHUNK = 1;

// How close (world units) a ship must pass to a chunk to collect it.
export const CHUNK_COLLECT_RADIUS = 45;

// A freshly-broken chunk can't be collected for this long, so ore visibly breaks
// off and hangs a moment before it can be vacuumed — even when mining point-blank
// (otherwise the miner, sitting inside the collect radius, would swallow it on
// the same tick it spawned).
export const CHUNK_ARM_MS = 700;

// Chunks scatter this far ALONG the surface (tangentially) from the impact, so a
// burst reads as a little cluster of debris rather than a single point.
export const CHUNK_SPREAD = 6;

// Minimum distance a chunk sits OUTSIDE the impact surface. Every chunk is pushed
// out along the radial (centre -> impact) direction — the side the shot came from
// — by at least this, so a chunk can never spawn inside the rock.
export const CHUNK_OUT_MARGIN = 5;

// How long an uncollected chunk drifts before it despawns (ms). Very generous
// (~5 min): a chunk is cheap — it renders in the shared instanced mesh and carries
// no replicated state (just a broadcast position + local timer) — so ore can hang
// around for a long time, letting you clear rock from range and swing back to
// scoop it well later.
export const CHUNK_TTL_MS = 300_000;

// How much ore a fresh ship can haul before it must sell.
export const DEFAULT_CARGO_CAPACITY = 20;

// Vendor economy: credits paid per ore unit sold, and the cost to fully repair.
export const ORE_SELL_PRICE = 10;
export const REPAIR_COST = 50;

// How close a ship must be to the vendor to sell/repair (world units).
export const VENDOR_TRADE_RADIUS = 300;

// How long a depleted asteroid stays gone before it respawns (ms). Long on
// purpose (~5 min): a mined-out patch should stay mined out, so the field
// depletes and players roam for fresh rock rather than farming one spot. Much
// longer than a ship's RESPAWN_DELAY, which is why combat picks per-entity.
export const ASTEROID_RESPAWN_DELAY = 300_000;

// The small ABSOLUTE world scale every asteroid shrinks toward as it is mined
// out — the same husk size for all of them, so a big rock travels a huge range
// (lots of visible shrinking) and a small one only a little. Applied to BOTH the
// render mesh and the physics collider so shots and ships meet the rock you see.
export const ASTEROID_MIN_SCALE = 4;

// Full ore of an asteroid of the given render scale. Clamped so even the
// smallest rock yields at least one chunk.
export function asteroidMaxOre(scale: number): number {
  return Math.max(ORE_STEP, Math.round(scale * ORE_PER_SCALE));
}

// The current world scale of an asteroid, stepped ONE notch per chunk given (not
// smoothly per hit): it holds steady between chunks, then drops when the next
// chunk breaks off. Every rock spans its spawn `baseScale` (full ore) down to the
// shared ASTEROID_MIN_SCALE husk (empty) over its OWN chunk count — so a big rock
// (many chunks) shrinks through many small steps and a small one through a few.
// The single source of truth the renderer and collider both shrink by.
export function asteroidScale(
  baseScale: number,
  health: number,
  maxOre: number,
): number {
  // A rock already smaller than the husk floor just keeps its size.
  const floor = Math.min(ASTEROID_MIN_SCALE, baseScale);
  const total = Math.max(1, Math.floor(maxOre / ORE_STEP)); // chunks in this rock
  const droppedRaw = Math.floor((maxOre - health) / ORE_STEP); // chunks given
  const dropped = droppedRaw < 0 ? 0 : droppedRaw > total ? total : droppedRaw;
  return baseScale - (baseScale - floor) * (dropped / total);
}

// How many whole chunks have broken off by the time ore has fallen to `ore`.
export function chunksDropped(maxOre: number, ore: number): number {
  return Math.floor((maxOre - ore) / ORE_STEP);
}

// The number of fresh chunks that break off as ore falls oreBefore -> oreAfter.
// Counted by total-mined amount (not by ore value), so the result is identical
// whether the drop arrives as one coalesced snapshot or many per-tick sub-steps.
export function chunksForRange(
  maxOre: number,
  oreBefore: number,
  oreAfter: number,
): number {
  return chunksDropped(maxOre, oreAfter) - chunksDropped(maxOre, oreBefore);
}

// The spawn point of a chunk: just OUTSIDE the shot's impact point, scattered
// along the rock's surface. Deterministic (seeded by the chunk's unique id, so
// the sim stays free of Math.random); the server broadcasts it, clients render it
// verbatim. `center` is the asteroid's position: the collider is a convex hull
// (star-shaped from its centre), so pushing the point radially outward past the
// impact guarantees it lands OUTSIDE the rock — never buried inside.
export function chunkSpawnPosition(
  impact: Vector3,
  center: Vector3,
  pickupId: number,
): Vector3 {
  const rng = Utils.randomNumberGenerator((pickupId + 1) >>> 0);

  // Outward radial direction (centre -> impact) ≈ the surface normal / the side
  // the projectile came from.
  const out = impact.clone().sub(center);
  const dist = out.length();
  if (dist < 1e-3) {
    out.set(0, 1, 0);
  } else {
    out.multiplyScalar(1 / dist);
  }

  // A random direction with its radial component removed → tangential (along the
  // surface), so the scatter never eats back into the rock.
  const tangent = new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
  tangent.addScaledVector(out, -tangent.dot(out));
  if (tangent.lengthSq() > 1e-6) {
    tangent.normalize();
  }

  // Always strictly beyond the surface (dist + margin + a little), plus the
  // tangential spread.
  const outward = dist + CHUNK_OUT_MARGIN + rng() * CHUNK_SPREAD;
  return center
    .clone()
    .addScaledVector(out, outward)
    .addScaledVector(tangent, rng() * CHUNK_SPREAD);
}
