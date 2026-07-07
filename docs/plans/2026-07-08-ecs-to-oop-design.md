# Removing ECS: ideal ground-up OOP architecture

Date: 2026-07-08
Status: Design approved

## Motivation

The game is built on `ecsy`: ~47 component classes, ~21 systems, and a `World`
wiring on both client and server. The problem is not ECS-the-pattern — it is that
`ecsy` fused three concerns that should be independent:

- **Simulation** (game rules, physics integration)
- **Presentation** (three.js scene, meshes, HUD)
- **Networking** (state serialization)

into one entity graph whose dirty-tracking (`changed: [Transform]` queries) is a
framework side-effect. That coupling blocks the rearchitecture goal:
Halo-2-style **whole-world prediction + state sync**. Prediction needs a
simulation that can be snapshotted, rewound, and re-run — which is exactly what a
query-driven entity graph makes awkward.

The target is a classical hand-rolled engine structure: three clearly separated
layers, each with a single clean seam for the future netcode work.

## Layer 1 — Simulation (`shared/sim/`)

Deterministic. No three.js *scene* objects, no DOM. three.js math types
(`Vector3`, `Quaternion`) are allowed — they carry no scene/DOM dependency.

```
World          entities: Map<id, Entity>
               tick(dt) runs an explicit ordered pipeline (below)
               spawn(entity) / despawn(id)
               serialize() / applySnapshot()   <- enables rewind/reconcile

Entity (base)  id, type, transform { position, rotation, scale }
               update(dt, world)
               serialize() / apply(state)
  Ship         velocity, angularVelocity, health, weapons; applyInput(cmd)
  Asteroid     mostly-static body
  Bullet       owner, ttl

InputCommand   sequence-numbered player input (seam for reconciliation)
```

**Update pipeline.** `World.tick()` runs a fixed, explicit phase order instead of
an implicit system-registration list:

```
input -> controllers -> physics.step -> collision -> damage
      -> spawn/despawn -> timeout
```

**Hybrid ownership.** Cross-entity concerns (physics, collision, networking) are
small **subsystem objects** the `World` owns. Per-entity behavior (fire weapon,
take damage, expire) are **methods on the entity**. Rich entities + a handful of
explicit subsystems is what hand-rolled engines look like, and it is cleaner than
either pure-OOP god-objects or ECS queries.

## Layer 2 — Presentation (client only, `client/src/render/`)

- `SceneManager` owns the three.js scene, camera, renderer, and EffectComposer
  (lifted from today's `game.js` constructor).
- `ViewRegistry` maps `entity.id -> mesh`, creating/destroying views as entities
  spawn/despawn. Each render frame it interpolates mesh transforms using the
  `alpha` value already computed today.
- HUD, projection, aim-assist, particles, and range become presentation services
  that **read** simulation state. They never own it.

Simulation ticks at a fixed rate; rendering runs at `requestAnimationFrame` with
interpolation — the same split that exists today, now with explicit ownership.

## Layer 3 — Networking (`shared/sim/net/` + per-side)

- Keep the existing `shared/messages.js` wire format.
- Server serializes entity state after each tick. The `ecsy` `changed: [Transform]`
  dirty-tracking is replaced by an explicit **snapshot diff** against the
  last-sent state. This is strictly better: it is the foundation for delta
  compression and reconciliation, rather than a framework side-effect.
- `NetworkServer` (server) and `NetworkClient` (client) own connection handling
  and message production/consumption, replacing the four network-*-system files.

## Key decisions

- **Keep** Ammo.js and three.js math types inside the simulation. **Encapsulate**
  Ammo behind a `PhysicsWorld` stepper that is *injected* into `World`, so the
  client can later inject the same stepper to predict. Today the client still only
  interpolates server transforms (no client physics) — matching current behavior,
  but with a clean seam.
- **Keep** `shared/messages.js`, `shared/types.js`, `shared/utils.js`, all assets,
  all game-feel/tuning constants, and the existing Ammo and three.js call logic.
  We are restructuring *ownership*, not rewriting physics or rendering math.
- **Delete** `ecsy` entirely at the end: the dependency, all `components/` dirs,
  all `systems/` dirs, and both `World` wirings.
- Collision/damage stay **server-side** for now (they derive from Ammo, which the
  client does not yet run). Their subsystem classes are written render/net-agnostic
  so they can move into shared sim once the client predicts.

## Approach

Build the new `shared/sim/` core, then port the server, then the client, verifying
end-to-end before deleting `ecsy`. `ecsy` cannot cleanly coexist half-removed, so
we avoid a long half-migrated state.

Phases:

1. **Sim core** — `shared/sim/`: `World`, `Entity` + subclasses, `InputCommand`,
   snapshot serialize/apply, the injected `PhysicsWorld` interface.
2. **Server** — `GameServer` owning `World` + `PhysicsWorld` + `NetworkServer` and
   the fixed-timestep loop. Port physics, controller, weapon, collision, damage,
   spawn, respawn, timeout logic. Port connection handling and snapshot-diff
   broadcasting.
3. **Client** — `Game` owning the client `World`, `SceneManager`, `ViewRegistry`,
   input controller, `NetworkClient`, and the render loop. Port model loading,
   instanced meshes, interpolation, HUD, projection, aim-assist, particles, range,
   input capture.
4. **Cleanup** — remove `ecsy` from `package.json`, delete `components/` and
   `systems/` dirs and both ECS `World` wirings, lint, and verify end-to-end
   (two tabs: fly, shoot, collide, respawn).

## Target directory layout

```
shared/sim/
  world.js
  entity.js
  entities/{ship,asteroid,bullet}.js
  input.js
  physics/physics-world.js        (interface; Ammo impl server-side)
  net/snapshot.js                 (serialize / diff / apply)

server/src/
  game-server.js                  (replaces world.js)
  net/network-server.js
  net/connection.js               (adapted)
  physics/ammo-physics-world.js   (Ammo impl of the stepper)
  subsystems/{collision,damage,spawn,weapon}.js   (or entity methods)
  spawner.js                      (adapted)

client/src/
  game.js                         (owns client World + render + net + input loop)
  render/{scene-manager,view-registry,hud,projection,particles,aim-assist}.js
  net/network-client.js
  input/{input-controller,keybindings}.js
```

## Verification

End-to-end manual check with two browser tabs after Phase 3, before Phase 4
deletion, and again after cleanup: connect two clients, fly with keyboard,
fire the primary weapon, collide with an asteroid and another ship, confirm
damage/destruction and respawn, confirm HUD/aim-assist render. The existing
`test/test.js` (puppeteer) is a secondary check.

## Prediction seams: status after the rearchitecture

The rearchitecture deliberately laid groundwork for whole-world prediction but
did **not** implement it. What exists today is structural, not yet functional —
before reconciliation can be built, these gaps must be closed:

- **Input sequencing is server-assigned, not client-stamped.** `connection.js`
  assigns `seq` on arrival and `Messages.Input` carries no seq on the wire, and
  the server never echoes `lastProcessedInput` back to the client. Client-side
  prediction needs the client to stamp each input with a seq, send it, and
  receive an ack so it can replay unacknowledged inputs.
- **World/entity serialization is transform-only.** `Entity.serializeNetworkState`
  emits position+rotation (matching the `Messages.World` wire format). Whole-world
  rewind needs full state — velocity, health, weapon timers, `ageMs`,
  `respawnTimer`, alive — plus `World.serialize()`/`applySnapshot()` (named in
  the design but not built).
- **What IS ready:** the simulation is deterministic and free of scene/DOM/net
  concerns; physics is injected (the client can inject the same `PhysicsWorld`
  stepper to predict); `World.tick(dt)` is a single call the client could drive.
  Those are the hard structural prerequisites; the two gaps above are the
  remaining work to make prediction real.

## Known faithful-port quirks (carried over intentionally)

Preserved verbatim from the original to keep this a pure restructure; fix
separately if desired: aim-assist computes `mouseInPixels.y` from `mouse.x`;
respawn returns a ship to its death location rather than a fresh random spot.
