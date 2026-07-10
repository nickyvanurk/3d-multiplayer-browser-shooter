# Asteroid Mining — Basic Launch Design

**Date:** 2026-07-10
**Status:** Design, ready for implementation planning

## Goal

Ship a fun, launchable asteroid-mining loop with minimal new surface, riding the
existing combat / respawn / snapshot machinery:

> shoot asteroid → ore chunks drop → fly through to collect → cargo fills →
> sell at the vendor for credits → repair / re-arm → repeat

This is the **EVE model**: an asteroid is a scalar ore quantity that depletes,
despawns, and respawns. There is **no voxel carving**, **no interest management**,
and **no persistence** in this launch. Those are explicit growth paths, not launch
requirements (see _Out of scope_).

### Why this shape

Research (2026-07-10 deep-research pass) confirmed that keeping destructible voxel
volumes resident for a large field is unnecessary and memory-heavy, and that the
authoritative server only needs a per-asteroid scalar — validated by Space
Engineers (seed + regenerate, persist only alterations) and EVE Online (each
asteroid is a finite ore quantity that depletes and respawns). Carving is a real,
authoritative feature (it can't be cosmetic-only) and is deferred to keep launch
small.

## Data model

- **Asteroid** (extends the existing static `weight = 0` rigid body):
  - `seed` — deterministic source for ore-chunk positions and shape variation.
  - `health` = **`oreRemaining`** — reuses the combat health field.
  - `alive = true`, `respawn = true` — opts into the existing deplete/respawn loop.
  - `oreValue` — ore granted per depletion threshold.
- **OrePickup** — new transient entity:
  - Server-side collidable body, but flagged **not-replicated** (the snapshot
    serializer skips it). Its position is derived, not sent.
  - Stable id = `(asteroidId, chunkIndex)`.
- **Ship**: add `cargo`, `cargoCapacity`, `credits`.

## Mining (reuses combat — near-zero new hit-path code)

Any weapon damages an asteroid through the existing
`CombatSubsystem.dealDamage`: the asteroid simply carries `health` and is not
`invulnerable`. `oreRemaining` **is** `health`, and it replicates through a spare
slot in `Entity.serializeNetworkState` (currently `0, 0`), so clients observe the
shrink for free.

Per-weapon **mining efficiency multipliers** are a later progression feature; the
launch treats all weapons equally against rock.

## Ore drops — impact-local spawn, server-authoritative collect

**Revised (2026-07-10, post-playtest).** The original plan spawned chunks from a
pure `f(asteroidSeed, chunkIndex)` so clients could re-derive positions with zero
bandwidth. Playtesting changed two requirements that this model can't meet:

1. Ore must spawn at the **impact point** of the shot (the face you're shooting),
   so a player can tuck behind a rock and mine the far side unseen. The client
   can't derive an impact point it never saw, so the server must send positions.
2. Mining point-blank auto-vacuumed ore the instant it spawned (the miner sits
   inside the collect radius), so chunks appeared to "despawn." Fixed with an
   **arm delay** + impact-local spawn (ore now appears at the rock, ~your firing
   distance away, and can't be collected for its first `CHUNK_ARM_MS`).

**Threshold count, impact position.** Ore still breaks off one chunk per `ORE_STEP`
mined (robust to coalesced snapshots — counted by total-mined, not ore value), but
each chunk spawns at the asteroid's `lastImpact` (stamped by combat: the bullet's
exact hit point) plus a small seeded scatter (`CHUNK_SPREAD`, still `Math.random`-free).

- **Server:** on an ore drop, spawns pickups (unique id, `arm`+`ttl` timers) at the
  impact point and broadcasts `OreDrop(id, x, y, z)` to all clients.
- **Client:** renders exactly what `OreDrop` reports — no derivation, no snapshot
  scanning. Small amber debris.

Cost: one small `OreDrop` per chunk (roughly a couple per second per active miner,
broadcast to all). Acceptable at launch scale; interest management remains the
growth path (out of scope).

**Collect (authoritative).** Once a chunk is armed, a ship within `CHUNK_COLLECT_RADIUS`
with cargo room collects it: credit cargo, broadcast one small `Collect(id)`; every
client removes that chunk. A full hold ignores it and the chunk remains.

**Lifetime.** Pickups expire on a generous TTL and are cleared when their parent
asteroid depletes/respawns. Because collection is server-authoritative, a
sub-second desync on the *exact* moment of expiry is cosmetically harmless (an
expired chunk grants nothing on either side). Accepted edge case.

## Dust effect (client-only cosmetic)

On each `oreRemaining` drop the client emits a short **dust puff** using
`client/public/textures/SpaceDust.png`, centered on the impact / asteroid. It
masks the visual "pop" when the asteroid's render scale snaps to the new ore level
and doubles as hit juice. Purely cosmetic: no server involvement, no determinism
requirement, affects nothing authoritative.

## Asteroid lifecycle

`oreRemaining → 0` enters the **existing** combat loop: `respawn === true` flips
`alive = false` and starts `respawnTimer`.

**New — gated respawn.** When the timer elapses, the asteroid re-inserts its body
only if the slot is clear of ships (bounding-radius proximity test, reusing the
`nearestShipDistance` / `ASTEROID_HULL_RADIUS` logic from `spawn.ts`). If a ship is
loitering there, it holds in a "ready but blocked" state and re-checks on later
ticks until the space frees. It respawns with a **fresh seed** so it reads as a new
rock.

## Cargo & vendor

- **Cargo** has a capacity. When full, the ship **stops collecting** (chunks remain
  until TTL) and the HUD shows **FULL** as the "go sell" nudge.
- **Vendor** — the freighter already orbiting at R=3000. Two proximity-triggered,
  **server-authoritative** actions:
  - **SELL** — cargo → credits at a fixed rate; empties the hold.
  - **REPAIR** — credits → ship `health`.
  The client sends a sell/repair request when in range; the server validates range
  and funds, then applies. No docking UI for launch.
- **Credits** are the score and the save-up-for-upgrades foundation; repair is the
  only sink at launch, which also closes the PvP loop (take damage → mine → sell →
  patch up → re-engage).

## Networking

**No interest management** — the whole field replicates to every client, exactly as
`NetworkServer.broadcast()` does today. New wire traffic:

- `Collect(asteroidId, chunkIndex)` — broadcast on authoritative pickup collection.
- `Sell` / `Repair` request + result.
- Owner-only **cargo / credits** stats message on change (not widened into the
  shared broadcast snapshot — only the owning client's HUD needs it).

`oreRemaining` uses the existing snapshot slot; no new per-tick broadcast cost for
the field itself.

## Testing (test/sim)

- **Determinism:** `f(seed, levelBefore → levelAfter)` yields an identical chunk
  set, and server output == client output, including coalesced multi-threshold
  ranges.
- **Lifecycle:** depletion → gated respawn — blocked while a ship loiters in the
  slot, fires exactly once the slot clears; respawn uses a fresh seed.
- **Economy:** cargo fills → hits cap → collection stops; sell empties cargo and
  adds the right credits; repair spends credits and restores health; out-of-range
  or insufficient-funds transactions are rejected.
- **No new nondeterminism** introduced on the sim path.

## Explicitly out of scope (later)

- Voxel carving / destructible geometry (authoritative; server-side deltas +
  editable collider — see research notes).
- Mining-specific weapons and the broader progression system.
- Buying anything beyond repair; upgrade catalog.
- Persistence (credits/cargo survive disconnect; server-restart durability).
- Interest management / area-of-interest streaming.
- Bigger-area expansion and higher asteroid counts.
