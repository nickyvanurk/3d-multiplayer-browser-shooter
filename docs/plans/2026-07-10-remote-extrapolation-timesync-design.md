# Remote Entity Extrapolation via Client/Server Time Sync

Date: 2026-07-10

## Problem

Remote entities in voidfall are updated from server `WORLD` snapshots with no
clock synchronization and no timestamps. `applyWorldState` snaps a remote body
to the latest snapshot pose+velocity and lets it coast on that velocity in the
client Rapier step, render-interpolating `prev → current` by the fixed-step
accumulator `alpha`.

Because the client has no idea how stale a snapshot is, a remote entity is
always placed ~half-RTT behind where it actually is, and uneven packet delivery
shows up as jitter. "Extrapolation" today is just physics coasting at wall-clock
rate with no knowledge of the snapshot's age.

## Goal

Synchronize the client clock to the server (NetStorm/TrinityCore technique,
reusing the existing gaming-platform implementation), timestamp each snapshot,
and place every dynamic remote entity at its **true present** position by
extrapolating forward by exactly `serverNow() − snapshotTime`.

Rendering model: **timestamped extrapolation** (no interpolation buffer, no
added latency). Chosen over an interpolation-delay buffer because it is the
smallest change from the current physics-coast model and keeps entities at
"now".

## Design

### 1. Clock synchronization (reused piece)

Port gaming-platform's `TimeSyncManager` into
`shared/sim/net/time-sync.ts` essentially verbatim — it is platform-agnostic
(pure clock math, no `three`, no DOM). It keeps a 6-sample ring, filters
samples by median+stddev latency, adopts the first sample immediately, and
applies 25 ms hysteresis. Surface used here:
`onTimeResponse(sentTime, serverTime, receiveTime)`, `serverNow()`, `reset()`,
`isSynced()`.

**Wire protocol** — two new tags in `shared/types.ts`, classes in
`shared/messages.ts`:

- `PING` (client→server): `[sentTime]` — client `performance.now()` at send.
- `PONG` (server→client): `[sentTime, serverTime]` — echoes `sentTime`, adds
  server `performance.now()`.

**Server** (`network-server.ts` / `connection.ts`): on `PING`, immediately
reply `PONG` with the echoed `sentTime` and the current server clock.
Stateless, no per-client bookkeeping.

**Client**: `NetworkClient` owns a `TimeSyncManager` **instance** (not the
gaming-platform module-level singleton — voidfall has one connection per game,
so an instance avoids cross-session leakage). After the socket opens, start a
~1 Hz ping loop (`setInterval`, pushing `PING`); it keeps running to track
drift. On `PONG`, call
`onTimeResponse(sent, serverTime, performance.now())`. Call `reset()` on
(re)connect — a new server process has an unrelated `performance.now()` origin.

Both clocks are monotonic millisecond clocks (`performance.now()` client, Node
`performance.now()` server), exactly what the algorithm expects.

### 2. Timestamping snapshots

Every `WORLD` broadcast carries the server clock at the instant it was built.

**Message change** (`shared/messages.ts`, `World`): prepend a single
`serverTime` number after the `WORLD` tag, before the per-entity run. Wire
becomes `[WORLD, serverTime, id, ...15 state..., id, ...]`. `serialize()` takes
`serverTime` as a constructor arg; `deserialize()` peels the first number off
and returns `{ serverTime, entities }`.

Ripples to:

- `network-server.ts` `broadcast()`: already receives `time` (the tick's
  server `performance.now()`) — pass it into `new Messages.World(relevant, time)`.
  Computed once per tick, shared by all connections.
- `connection.ts` (client) dispatch + the `IncomingMessage` union `WORLD`
  variant: `data` gains `serverTime`.
- `network-client.ts` `applyWorldState(data)`: reads `data.serverTime` and
  `data.entities`.

**Staleness** per snapshot: `age = clamp(serverNow() − serverTime, 0, MAX_EXTRAP_MS)`,
computed once per `applyWorldState` call and reused for every entity in it.

- If `timeSync.isSynced()` is false (before the first PONG), `age = 0` — fall
  back to today's behavior (raw snap) until the clock is warm, so the first
  snapshots don't lurch on a garbage delta.
- `age` is floored at 0 (never extrapolate backward if a delta briefly
  overshoots).
- `MAX_EXTRAP_MS` (~250 ms) ceiling so a GC pause, backgrounded tab, or a
  wildly wrong early delta can't fling an entity across the map.

### 3. Applying extrapolation (all dynamic entities)

Core change in `network-client.ts` `applyWorldState`. Resolve each entity's
velocity to world space and advance pose by `age`:

```
worldVel(entity) = has body → velocity (already world-space)
                   bullet    → velocity.applyQuaternion(rotation)  // local +z forward
extrapPos = position + worldVel * (age / 1000)
extrapRot = integrate(rotation, angularVelocity, age)  // small-angle quaternion step
```

`integrate` builds a delta quaternion from `angularVelocity * (age/1000)`
(world-space angular velocity → axis-angle) and premultiplies. Bullets have no
angular velocity, so their rotation is unchanged.

Apply per branch as today but with the extrapolated pose:

- **Body entities (ships):** `setTranslation(extrapPos)`, `setRotation(extrapRot)`,
  `setLinvel(velocity)`, `setAngvel(angularVelocity)`; the client Rapier step
  then coasts forward. **This composes exactly:** a one-time jump of
  `worldVel·age` at receipt plus per-tick coasting from receipt-time equals
  continuous extrapolation to the current `serverNow()` — no per-frame code, no
  double-counting.
- **Vendor (kinematic):** `position`/`rotation` set to the extrapolated pose,
  `velocity` copied; client-sim keeps dead-reckoning it forward from there.
- **No-body mirrors (remote bullets):** set `prevPosition/prevRotation` for the
  render lerp, then `position/rotation` to the extrapolated pose.

Static asteroids carry zero linear/angular velocity, so `age` has no effect on
them — the "all dynamic entities" rule needs no type check; it falls out of the
velocity being zero. The only type-awareness is the world-vs-local velocity
frame resolution above.

### 4. Testing

Unit tests in `test/sim/`, following the existing sim-test style:

- `time-sync.test.ts` — first sample adopted immediately; median+stddev
  filtering discards a latency spike; hysteresis suppresses sub-25 ms wobble;
  `reset()` clears state; steady-connection (`<=` boundary) engages the window
  mean. Pure/deterministic — synthetic `(sent, server, recv)` triples.
- `extrapolation.test.ts` — composition property: a snapshot with known
  velocity and known `age` places the body at `pos + worldVel*age` (bullet
  branch rotates local velocity first). `age` clamps at `MAX_EXTRAP_MS`; an
  unsynced clock yields `age = 0` (raw snap). Drive with a fake `SimBody`
  capturing `setTranslation`, no Rapier.
- Rotation: `integrate` advances orientation by `angvel*age` within tolerance;
  identity at `age = 0`.

Edge cases as tests/guards: `reset()` on reconnect; `age` floored at 0; local
ship still skipped (`id === localPlayerId`); health/`renderInput` handling
unchanged.

## Not doing (YAGNI)

- No interpolation-delay buffer.
- No Unity-style tick-rate drift correction (gaming-platform omits it; the
  6-sample window + hysteresis already tracks drift).
- No per-frame re-extrapolation (the receipt-jump + physics coast composes).
- No bullet smoothing between snapshots.

## Rollout

TDD each piece in order: clock math first (fully isolated), then the wire
messages (PING/PONG + WORLD `serverTime`), then the `applyWorldState` change.
Verification via tests and the user's own already-running dev servers — do not
launch dev servers.
