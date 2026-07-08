# State-Sync + Client-Authoritative Movement — Design

Date: 2026-07-08
Status: approved (first cut, "keep it simple, rework later")

## Goal

Replace the current server-authoritative / dumb-mirror-client netcode with a
**state-synchronization model where each client is authoritative over its own
ship's movement**, and projectiles are predicted client-side for zero-latency
feel while the server stays authoritative over damage and kills.

## Hard constraints (drive every decision)

- **Compute budget: one physics tick per fixed-update step. No re-simulation.**
  This rules out rollback / input-replay reconciliation (GGPO, CS/Valorant
  style). The only correction mechanism available is error-smoothing
  (snap the sim, blend the render) — and that smoothing is **deferred**.
- Keep the existing fixed-timestep loop architecture (60 Hz accumulator on
  server and client; render interpolates between steps via ViewRegistry alpha).
- Rapier can be made deterministic; both client and server run it.
- Target scale later: single shard, hundreds in one battle (interest management
  deferred — not in this cut).

## Model (first cut)

**Movement — client-authoritative, state-synced**
- Each client simulates *its own* ship locally every fixed step (input →
  velocity → integrate → resolve collision vs the asteroid field on the
  client's own physics world). Zero input latency.
- The client sends its resulting `{position, rotation, velocity, angularVelocity}`
  to the server every tick.
- The server sets that ship's body from the received state (kinematic,
  position-based) and **does not re-simulate it**. It broadcasts the state to
  every other client, which render it as remote mirrors with interpolation
  (unchanged from today).
- The client **ignores** server echoes of its own ship (it owns it). No
  server correction in this cut.

**Projectiles — predicted cosmetic, server-authoritative damage**
- On fire, the client's own-ship sim spawns a local bullet immediately (client
  id range), rendered like any bullet, aged out by the client sim. Purely for
  feel — deals no damage.
- The client sends a `FIRE` event (muzzle transform + damage) to the server.
- The server spawns the **authoritative** bullet, simulates it, runs collision
  → `CombatSubsystem` (unchanged), applies damage, and awards kills.
- The server broadcasts the authoritative bullet spawn to everyone **except the
  firing owner** (avoids a double bullet for the shooter). Damage/deaths reach
  all clients via the existing alive-transition Despawn broadcast.

**Damage & kills — server-authoritative** (existing `CombatSubsystem`,
respawn subsystem, and alive-transition broadcast are reused as-is).

## What is explicitly deferred (the "rework later" list)

- Dead-reckoning / **projective velocity blending** smoothing of remote ships
  and of own-ship server corrections (ref: Murphy, *Game Engine Gems 2* ch.18).
- **Server correction of the local ship** and therefore *good* ship-vs-ship
  collision. In this cut ship-ship collisions are only as good as two
  independent client sims plus interpolation — acceptable, not great.
- **Lag-compensated hit detection** (server rewind via a position-history ring
  buffer — a lookup, not a resim). First cut does hit detection at present-time
  on the server.
- **Deterministic fire-event bullet replication** (simulate the identical
  bullet everywhere from one event). First cut replicates authoritative bullet
  state the normal way.
- **Interest management / AoI** for fleet scale.
- Health/hit feedback messages (first cut shows deaths only, via Despawn).

## Key architectural facts & gotchas (discovered while reading the code)

1. **Client needs a real physics world.** Client-authoritative movement with
   asteroid collision means the client must run Rapier for its own ship. Today
   the client has no physics. `RapierPhysicsWorld` loads meshes via Node fs
   paths, so mesh/vertex loading must be abstracted behind an injectable
   provider: Node-fs provider on the server, browser-GLB provider on the client
   (the client already loads these GLBs in `ViewRegistry`).

2. **Collision-type gotcha.** Bullets are kinematic sensors; player ships are
   currently *dynamic*. Making the server ship *kinematic* (driven by client
   state) turns bullet↔ship contact into KINEMATIC_KINEMATIC, which is **not**
   in `BULLET_COLLISION_TYPES` today (`DEFAULT | KINEMATIC_FIXED`). Must add
   `RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC` or bullets stop hitting
   ships.

3. **Id namespaces.** Client-predicted bullets must not collide with
   server-owned ids in `world.entities` / `world._slots`. Predicted entities get
   ids from a high client-only range (e.g. ≥ 2^20).

4. **Only owned entities are ticked on the client.** The client sim steps the
   local ship + local predicted bullets only; remote entities stay mirror +
   interpolation (ticking them would double-simulate). Reuses today's rule
   ("client NEVER ticks the whole sim").

5. **Server stops driving player ships.** No client input reaches the server for
   movement, so the server no longer runs `Ship.applyInput` / weapon firing for
   player ships; it spawns authoritative bullets from `FIRE` events instead.

## Rejected alternatives (for the record)

- **Deterministic lockstep / GGPO rollback** — needs re-simulation; over budget.
- **Full server-authoritative + client prediction with reconciliation**
  (CS/Overwatch) — reconciliation replays N ticks; over budget.
- **Local Perception Filters** (Ryan/Sharkey time-distortion) — needs
  cross-client determinism we won't guarantee for fast projectiles, and doesn't
  scale to clustered fleet battles.
