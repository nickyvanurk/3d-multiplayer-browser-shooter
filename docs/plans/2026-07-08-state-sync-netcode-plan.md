# State-Sync + Client-Auth Movement — Implementation Plan

Companion to `2026-07-08-state-sync-netcode-design.md`. Ordered so each task
leaves the game runnable.

## Task 1 — Wire protocol (`shared/types.ts`, `shared/messages.ts`)

- Add message ids: `STATE` (client→server: own ship
  `position,rotation,velocity,angularVelocity`), `FIRE` (client→server: muzzle
  `position,rotation` + `damage` + client bullet id).
- Keep `GO/HELLO/WELCOME/SPAWN/DESPAWN/WORLD`. `INPUT` will be removed in Task 6.
- Add `State`/`Fire` message classes with `serialize`/`deserialize`, mirroring
  the existing array-tag convention.

Verify: `npm run typecheck` (or `tsc --noEmit`) passes.

## Task 2 — Injectable mesh/vertex provider for physics

- Extract the convex-vertex/mesh loading out of `RapierPhysicsWorld`
  (`getConvexVertices` / `assetManager.getTriangles` / model paths) behind an
  interface, e.g. `VertexProvider { getConvexVertices(kind, scale): Float32Array }`.
- Server provider = current Node `AssetManager` path loading.
- Move `RapierPhysicsWorld` to a shared location importable by the client
  (e.g. `shared/sim/physics/rapier-physics-world.ts`); inject the provider.

Verify: server still boots and simulates (run server, existing behavior intact).

## Task 3 — Client physics world

- Add a browser `VertexProvider` that extracts triangles from the GLBs
  `ViewRegistry` already loads (reuse `buffer-geometry-utils` merge logic).
- In `client/src/game.ts`, construct a `RapierPhysicsWorld` with the browser
  provider; `await physics.init()` in `Game.init`; set `world.physics`.
- Add asteroid bodies to the client physics world as their `SPAWN` messages
  arrive (fixed/static), and the local ship body when it spawns.

Verify: client boots, asteroid + own-ship colliders exist (log body count).

## Task 4 — Client owned-entity sim + input→own ship

- Introduce ownership: local ship (`localPlayerId`) and client-range bullet ids
  are "owned"; everything else is a remote mirror.
- In `Game.update` (the fixed step): sample input → set the owned ship's
  `controller.lastInput` → run the owned-entity sim: `ship.update` (applies
  input, fires weapons → spawns predicted bullets with client-range ids) →
  `physics.applyAll`+`step` for owned bodies → age predicted bullets.
- Do NOT tick remote entities. Make `NetworkClient.applyWorldState` **skip the
  local ship id** (client owns it).
- Predicted bullets: spawned via `world.spawnWithId(clientId++, bullet)`;
  rendered by ViewRegistry; expired by `Bullet.update`.

Verify: driving the ship responds with zero latency locally; predicted bullets
appear instantly on click and expire.

## Task 5 — Client → server: state + fire; Server authoritative side

Client (`network-client.ts`, `game.ts`):
- Replace `sendInput` with `sendState` (own ship transform+velocity every tick)
  and `sendFire` (emitted when the owned weapon fires).

Server (`network-server.ts`, `game-server.ts`, `rapier-physics-world.ts`):
- On `STATE`: copy transform+velocity onto the player ship; make player ships
  **kinematic position-based** bodies driven by that state (stop running
  `Ship.applyInput`/weapon fire for them).
- Add `KINEMATIC_KINEMATIC` to `BULLET_COLLISION_TYPES` (gotcha #2).
- On `FIRE`: spawn authoritative `Bullet` at the muzzle with `damage`+owner;
  broadcast its `Spawn` to everyone **except the owner** (extend
  `broadcastMessage` ignore / `onEntitySpawned` to accept an ignored id).
- Keep `CombatSubsystem`, `RespawnSubsystem`, alive-transition Despawn broadcast,
  bullet stepping as-is.

Verify: two browser clients — each sees the other move; shooting deals damage
and kills (victim despawns) driven by the server; shooter sees no double bullet.

## Task 6 — Remove old-model fluff

- Remove `INPUT` message, `Connection.inputBuffer`, `sequenceNumber`,
  `lastProcessedInput`, and the stale-input `seq` reconciliation loop in
  `NetworkServer.processIncoming`.
- Remove the client's dumb-mirror handling of its own ship.
- Update tests: `test/sim/input.test.ts`, `test/sim/snapshot.test.ts`, add a
  test for `State`/`Fire` (de)serialization.

Verify: `npm test` green; full two-client playtest via `/run`.

## Open micro-decisions (defaulted)

- Own bullet double-render → server does not echo owner's authoritative bullet.
- Health/hit feedback → deferred; deaths shown via Despawn only.
- Staging option: Task 3 (client physics) is the heaviest. If we want an even
  smaller v0 first, ship Tasks 1/4/5 with the client integrating its ship
  *kinematically without asteroid collision*, then add Task 3 next. Flag before
  starting.
