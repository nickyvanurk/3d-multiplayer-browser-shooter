# ECS → OOP Rearchitecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `ecsy` ECS on both client and server with a classical hand-rolled OOP engine — rich entity classes plus a small set of explicit subsystems — separated into simulation / presentation / networking layers, with clean seams for future whole-world prediction.

**Architecture:** See `docs/plans/2026-07-08-ecs-to-oop-design.md`. Three layers: a deterministic simulation core in `shared/sim/` (`World`, `Entity` subclasses, injected `PhysicsWorld` stepper, snapshot diff); a client-only presentation layer (`SceneManager`, `ViewRegistry`, HUD/particles/etc. that *read* sim state); and a network layer producing the existing `shared/messages.js` wire format via explicit snapshot diffing instead of ecsy `changed` queries.

**Tech Stack:** Node **native ESM** (`"type": "module"`, run via `node`/`nodemon` — the project was migrated off `babel-node` mid-plan, commit `2892b23`), Vite + three.js (client), Ammo.js (physics), `ws` (WebSocket). No new runtime dependencies; `ecsy` is removed at the end.

**ESM rule (post-migration):** All relative imports MUST carry an explicit `.js` extension (e.g. `import { Entity } from '../entity.js'`) — native ESM does not resolve extensionless specifiers. Bare package imports (`three`, `ws`) stay as-is. `test:sim` runs via `node`, not `babel-node`. Do not reintroduce babel or extensionless imports. The `test/test.cjs` puppeteer test stays `.cjs` (CommonJS under `type: module`).

**Porting principle:** We restructure *ownership*, not physics/render math. When a task says "port from `X:lines`", read that source, move the logic verbatim into the new class, and change only how it reads/writes state (entity fields instead of `getComponent`/`getMutableComponent`). Keep all tuning constants, all Ammo calls, all three.js calls identical.

**Verification principle:** The sim core is pure and gets TDD (Tasks 1–12). The presentation and networking layers are integration-heavy (Ammo, three.js, WebSocket, DOM) and are verified end-to-end by running the game with two browser tabs (use the `/run` skill to launch, `/verify` before each phase's commit). Do not fake unit tests for rendering/networking by mocking three.js or `ws` — drive the real thing.

---

## Ground truth: what exists today

- **ECS wiring:** `server/src/world.js` and `client/src/game.js` register ~47 components and ~21 systems.
- **Entities today are ecsy entities** with a `worldId` field and components. IDs are dense array indices assigned by `getWorldId` (`server/src/spawner.js:103-112`) — reused free slots. Keep this ID scheme.
- **Server loop:** fixed timestep at 60Hz via `Utils.createFixedTimestep` (`shared/utils/create-fixed-timestep.js`), `world.js:95-117`.
- **Client loop:** `game.js:213-262` — `update()` (fixed 60Hz sim via worker interval) + `render()` (rAF with interpolation `alpha`).
- **Wire format:** `shared/messages.js` — `Go`, `Hello`, `Welcome`, `Spawn`, `Despawn`, `Input`, `World`. **Keep the serialized array formats byte-for-byte.**
- **Connection:** `server/src/connection.js` already has `inputBuffer`, `sequenceNumber`, `lastProcessedInput` — the reconciliation seam is half-present. Keep it.
- **Entity field shapes** (from component schemas):
  - `Transform`: `position:Vector3`, `rotation:Quaternion`, `scale:Number=1` (client also tracks `prevPosition`, `prevRotation` for interpolation).
  - `RigidBody`: `acceleration:Number`, `angularAcceleration:Euler`, `velocity:Vector3`, `angularVelocity:Vector3`, `damping:Number`, `angularDamping:Number`, `weight:Number=1`, `kinematic:Boolean`.
  - `Weapon`: `offset:Vector3`, `delay:Number`, `fireInterval:Number=100`, `lastFiredTimestamp:Number`, `parent:Ref`, `firing:Boolean`.
  - `Health`: `value:Number=100`. `Damage`: `value:Number`.
  - Marker/behaviour components → boolean flags or subclass identity: `Active`, `Timeout{timer,addComponents}`, `Destroy`, `Collision{collidingWith[]}`, `Aim` (a `Ray`+distance), `Respawn`, `SufferDamage`, `DestroyOnCollision`, `RandomSpawn`, `Spawned`, `Playing`, `Kind{value}`.

---

## Phase 0 — Test harness & shared math helpers

### Task 1: Dependency-free sim test harness

**Files:**
- Create: `test/sim/harness.js`
- Create: `test/sim/index.js`
- Modify: `package.json` (scripts)

**Step 1: Write the harness**

```js
// test/sim/harness.js
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export async function run() {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ok   ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.stack}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
```

```js
// test/sim/index.js
import './world.test';
import './entity.test';
import './snapshot.test';
import { run } from './harness';
run();
```

(As each later task adds a `*.test.js`, add its `import` line here.)

**Step 2: Add npm script**

In `package.json` `scripts`, add:
```json
"test:sim": "node test/sim/index.js"
```

**Step 3: Verify harness runs**

Run: `npm run test:sim`
Expected: fails because `./world.test` doesn't exist yet — that's fine, it confirms the runner wiring. Comment out the imports in `index.js` until each test file exists, or create empty stubs. Prefer: create the test files as you reach each task.

**Step 4: Commit**

```bash
git add test/sim/harness.js test/sim/index.js package.json
git commit -m "test: add dependency-free sim test harness"
```

---

## Phase 1 — Simulation core (`shared/sim/`)

All Phase 1 code is pure (three.js *math* only — `Vector3`, `Quaternion`, `Euler`, `Ray`, `Matrix4`). No scene, no DOM, no Ammo, no `ws`.

### Task 2: `Transform` value object

**Files:**
- Create: `shared/sim/transform.js`
- Test: `test/sim/transform.test.js`

**Step 1: Write the failing test**

```js
// test/sim/transform.test.js
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { Transform } from '../../shared/sim/transform';
import { test } from './harness';

test('Transform defaults to origin, identity, scale 1', () => {
  const t = new Transform();
  assert.deepEqual(t.position.toArray(), [0, 0, 0]);
  assert.equal(t.scale, 1);
});

test('Transform.copy overwrites without aliasing', () => {
  const a = new Transform({ position: new Vector3(1, 2, 3) });
  const b = new Transform();
  b.copy(a);
  a.position.x = 9;
  assert.equal(b.position.x, 1);
});
```
Add `import './transform.test';` to `test/sim/index.js`.

**Step 2: Run, expect FAIL** (`Cannot find module .../transform`).
Run: `npm run test:sim`

**Step 3: Implement**

```js
// shared/sim/transform.js
import { Vector3, Quaternion } from 'three';

export class Transform {
  constructor({ position, rotation, scale } = {}) {
    this.position = position ? position.clone() : new Vector3();
    this.rotation = rotation ? rotation.clone() : new Quaternion();
    this.scale = scale ?? 1;
  }

  copy(other) {
    this.position.copy(other.position);
    this.rotation.copy(other.rotation);
    this.scale = other.scale;
    return this;
  }
}
```

**Step 4: Run, expect PASS.** **Step 5: Commit** `feat(sim): add Transform value object`.

### Task 3: `Entity` base class

**Files:**
- Create: `shared/sim/entity.js`
- Test: `test/sim/entity.test.js`

Entity holds identity + transform + a `destroyed` flag, and defines the update/serialize contract. Subclasses fill in behaviour.

**Step 1: Failing test**

```js
// test/sim/entity.test.js
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Entity } from '../../shared/sim/entity';
import { test } from './harness';

test('Entity serialize round-trips transform', () => {
  const e = new Entity({ id: 4, type: 1 });
  e.transform.position.set(1, 2, 3);
  const clone = new Entity({ id: 4, type: 1 });
  clone.applyNetworkState(e.serializeNetworkState());
  assert.deepEqual(clone.transform.position.toArray(), [1, 2, 3]);
});

test('Entity.markDestroyed sets flag', () => {
  const e = new Entity({ id: 1, type: 1 });
  assert.equal(e.destroyed, false);
  e.markDestroyed();
  assert.equal(e.destroyed, true);
});
```

**Step 3: Implement**

```js
// shared/sim/entity.js
import { Transform } from './transform';

export class Entity {
  constructor({ id, type, transform } = {}) {
    this.id = id;
    this.type = type;            // Types.Entities.*
    this.transform = new Transform(transform);
    this.destroyed = false;
  }

  update(_dt, _world) {}

  markDestroyed() { this.destroyed = true; }

  // Network state = the fields that replicate to clients (position + rotation).
  // Matches the Messages.World wire layout (7 numbers after the id).
  serializeNetworkState() {
    const { position: p, rotation: r } = this.transform;
    return [p.x, p.y, p.z, r.x, r.y, r.z, r.w];
  }

  applyNetworkState([px, py, pz, rx, ry, rz, rw]) {
    this.transform.position.set(px, py, pz);
    this.transform.rotation.set(rx, ry, rz, rw);
  }
}
```

**Step 4–5:** Run (PASS), commit `feat(sim): add Entity base class`.

### Task 4: Entity subclasses — `Asteroid`, `Bullet`, `Ship`

**Files:**
- Create: `shared/sim/entities/asteroid.js`, `shared/sim/entities/bullet.js`, `shared/sim/entities/ship.js`
- Test: `test/sim/entities.test.js`

These hold the per-entity state that today lives in `RigidBody`/`Health`/`Weapon`/`Timeout`/etc. Fields come from the schemas listed in "Ground truth". Behaviour methods are filled in later tasks — here just the data + constructors matching `server/src/spawner.js`.

**Ship** (port fields from `spawner.js:22-62`):
```js
// shared/sim/entities/ship.js
import { Vector3, Euler, Ray } from 'three';
import { Entity } from '../entity';
import Types from '../../types';

export class Ship extends Entity {
  constructor(opts = {}) {
    super({ ...opts, type: Types.Entities.SPACESHIP });
    this.acceleration = 3;
    this.angularAcceleration = new Euler(6, 12, 2);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.5;
    this.angularDamping = 0.99;
    this.weight = 1;
    this.kinematic = false;
    this.health = 100;
    this.aim = new Ray();
    this.aimDistance = 0;
    this.weapons = [];          // Weapon instances (Task 8)
    this.firingPrimary = false;
    this.controller = null;     // { connection, lastInput } (Task 9)
    this.respawn = true;
    this.randomSpawn = true;
  }
}
```

**Asteroid** (port from `spawner.js:65-80`): fields `acceleration=0`, `angularAcceleration=Euler(0,0,0)`, `velocity`, `angularVelocity`, `damping=0.001`, `angularDamping=0.1`, `weight = scale <= 5 ? 1 : 0`, `kinematic=false`. Constructor takes `{ id, transform, scale }`.

**Bullet** (port from `spawner.js:82-100`): fields `velocity = new Vector3(0,0,speed)`, `kinematic=true`, `weight=1`, `damage`, `timeoutMs` (default 2000), `ageMs=0`, `destroyOnCollision=true`, `owner` (the firing Ship, for ignoring self-collision if desired). Constructor `{ id, transform, damage, speed=0.5, timer=2000 }`.

**Test:** assert each subclass sets `type` correctly and copies constructor args (e.g. Bullet `damage`, Asteroid `weight` for scale 6 = 0, scale 5 = 1).

Commit `feat(sim): add Ship/Asteroid/Bullet entity classes`.

### Task 5: `InputCommand`

**Files:**
- Create: `shared/sim/input.js`
- Test: `test/sim/input.test.js`

Wraps a decoded `Messages.Input` payload plus its sequence number (the reconciliation seam). Fields exactly match `Messages.Input` (`shared/messages.js:102-156`): `forward, backward, rollLeft, rollRight, strafeLeft, strafeRight, strafeUp, strafeDown, boost, weaponPrimary, aim`, plus `seq`.

```js
// shared/sim/input.js
export class InputCommand {
  constructor(data = {}, seq = 0) {
    Object.assign(this, {
      forward: false, backward: false,
      rollLeft: false, rollRight: false,
      strafeLeft: false, strafeRight: false, strafeUp: false, strafeDown: false,
      boost: false, weaponPrimary: false, aim: null,
    }, data);
    this.seq = seq;
  }
  static empty() { return new InputCommand(); }
}
```
Test: `new InputCommand({ forward: true }, 7).seq === 7` and defaults are false. Commit.

### Task 6: `World` container + spawn/despawn + ID allocation

**Files:**
- Create: `shared/sim/world.js`
- Test: `test/sim/world.test.js`

The `World` owns `entities` (a `Map<id, Entity>`) and an ordered list of **subsystems** (objects with `update(world, dt, time)`). It preserves today's dense-index ID reuse (`spawner.js:103-112`).

**Step 1: Failing test**

```js
// test/sim/world.test.js
import assert from 'node:assert/strict';
import { World } from '../../shared/sim/world';
import { Entity } from '../../shared/sim/entity';
import { test } from './harness';

test('spawn assigns reused dense ids', () => {
  const w = new World();
  const a = w.spawn(new Entity({ type: 1 }));
  const b = w.spawn(new Entity({ type: 1 }));
  assert.equal(a.id, 0); assert.equal(b.id, 1);
  w.despawn(0);
  const c = w.spawn(new Entity({ type: 1 }));
  assert.equal(c.id, 0);               // reuses freed slot
});

test('tick runs subsystems in registration order', () => {
  const order = [];
  const w = new World();
  w.addSubsystem({ update: () => order.push('a') });
  w.addSubsystem({ update: () => order.push('b') });
  w.tick(16, 0);
  assert.deepEqual(order, ['a', 'b']);
});

test('tick calls entity.update then reaps destroyed', () => {
  const w = new World();
  const e = w.spawn(new Entity({ type: 1 }));
  e.update = () => e.markDestroyed();
  w.tick(16, 0);
  assert.equal(w.entities.has(e.id), false);
});
```

**Step 3: Implement**

```js
// shared/sim/world.js
export class World {
  constructor() {
    this.entities = new Map();
    this.subsystems = [];
    this._slots = [];            // dense id -> Entity | undefined (mirrors old scheme)
    this.onSpawn = null;         // hooks the network/presentation layers subscribe to
    this.onDespawn = null;
  }

  addSubsystem(s) { this.subsystems.push(s); return this; }

  spawn(entity) {
    let id = this._slots.findIndex((x) => x === undefined);
    if (id === -1) id = this._slots.length;
    this._slots[id] = entity;
    entity.id = id;
    this.entities.set(id, entity);
    if (this.onSpawn) this.onSpawn(entity);
    return entity;
  }

  despawn(id) {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.entities.delete(id);
    this._slots[id] = undefined;
    if (this.onDespawn) this.onDespawn(entity);
  }

  get(id) { return this.entities.get(id); }

  tick(dt, time) {
    for (const e of this.entities.values()) e.update(dt, this, time);
    for (const s of this.subsystems) s.update(this, dt, time);
    for (const e of [...this.entities.values()]) {
      if (e.destroyed) this.despawn(e.id);
    }
  }
}
```

Note: entity-driven destruction (bullet timeout) sets `destroyed`; cross-entity destruction (collision → damage) is a subsystem that also sets `destroyed`. Reaping happens once at end of tick. Commit `feat(sim): add World with dense-id spawn/despawn and tick pipeline`.

### Task 7: Snapshot serialize / diff / apply (`shared/sim/net/snapshot.js`)

**Files:**
- Create: `shared/sim/net/snapshot.js`
- Test: `test/sim/snapshot.test.js`

This replaces ecsy's `changed: [Transform]` dirty-tracking. A `SnapshotDiffer` remembers the last-sent network state per entity id and reports which entities changed since. It emits data compatible with `Messages.World` (`shared/messages.js:158-200`), which is a flat array of `[id, px,py,pz, rx,ry,rz,rw]` per changed entity.

**Step 1: Failing test**

```js
// test/sim/snapshot.test.js
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { World } from '../../shared/sim/world';
import { Entity } from '../../shared/sim/entity';
import { SnapshotDiffer } from '../../shared/sim/net/snapshot';
import { test } from './harness';

test('first diff reports all entities; second reports none', () => {
  const w = new World();
  const e = w.spawn(new Entity({ type: 1 }));
  const d = new SnapshotDiffer();
  assert.equal(d.changed(w).length, 1);
  assert.equal(d.changed(w).length, 0);       // nothing moved
});

test('moving an entity makes it appear in the diff', () => {
  const w = new World();
  const e = w.spawn(new Entity({ type: 1 }));
  const d = new SnapshotDiffer();
  d.changed(w);
  e.transform.position.set(5, 0, 0);
  const changed = d.changed(w);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, e.id);
});
```

**Step 3: Implement**

```js
// shared/sim/net/snapshot.js
export class SnapshotDiffer {
  constructor() { this.last = new Map(); }   // id -> "px,py,pz,rx,ry,rz,rw"

  changed(world) {
    const out = [];
    const seen = new Set();
    for (const e of world.entities.values()) {
      seen.add(e.id);
      const state = e.serializeNetworkState();
      const key = state.join(',');
      if (this.last.get(e.id) !== key) {
        out.push({ id: e.id, state });
        this.last.set(e.id, key);
      }
    }
    for (const id of this.last.keys()) if (!seen.has(id)) this.last.delete(id);
    return out;
  }
}
```

Commit `feat(sim): add SnapshotDiffer replacing ecsy changed-queries`.

### Task 8: `PhysicsWorld` stepper interface + Ship/Bullet integration methods

**Files:**
- Create: `shared/sim/physics/physics-world.js` (interface/contract + no-op default)
- Test: `test/sim/physics-contract.test.js`

Define the seam the `World` calls, so the concrete Ammo implementation lives server-side (Task 14) and the client can inject the same one later for prediction.

```js
// shared/sim/physics/physics-world.js
// Contract: a physics stepper the World drives. Server injects an Ammo-backed
// implementation; the client injects a no-op today (interpolation only) and the
// real stepper later for prediction.
export class NullPhysicsWorld {
  add(_entity) {}
  remove(_entity) {}
  applyControls(_entity, _dt) {}
  step(_dt) {}
  drainCollisions() { return []; }   // [{ a: Entity, b: Entity }]
}
```
Test: `NullPhysicsWorld` has all five methods and `drainCollisions()` returns `[]`. Commit `feat(sim): define PhysicsWorld stepper contract`.

### Task 9: `Weapon` value object + Ship firing logic

**Files:**
- Create: `shared/sim/weapon.js`
- Test: `test/sim/weapon.test.js`

Port `Weapon` fields from the schema and the firing state-machine from `server/src/systems/weapon-system.js:28-63`, and `getWeaponTransform` from `weapon-system.js:66-89`. A `Weapon` belongs to a `Ship` (`parent`), has `offset/delay/fireInterval/lastFiredTimestamp/firing`, and a method `tryFire(time, world, spawnBullet)` that returns a new Bullet spawn request when it fires. Keep the exact timing arithmetic.

TDD the timing: given `delay=125`, `fireInterval=250`, and `firingPrimary=true`, assert first shot occurs after `delay` and subsequent shots every `fireInterval` (drive `time` forward manually, collect fire events). Assert no fire when `firingPrimary=false`.

`getWeaponTransform` logic (offset rotated by ship rotation + aim ray → look-at quaternion) ports verbatim; unit-test that with no aim the bullet rotation equals the ship rotation and position equals `offset.applyQuaternion(rot).add(pos)`.

Commit `feat(sim): port weapon firing state machine`.

### Task 10: Ship control + kinematics (`Ship.update`)

**Files:**
- Modify: `shared/sim/entities/ship.js`
- Test: extend `test/sim/entities.test.js`

Port the control math from `server/src/systems/spaceship-controller-system.js:54-95` into `Ship.applyInput(input, dt)`: map input booleans → movement vector, write `velocity` and `angularVelocity` (including the `angularVelocity.z` damping `Math.pow(angularDamping, dt)` and the `< 0.000001 → 0` clamp), and update the `aim` ray. `Ship.update(dt, world, time)` calls `applyInput` using `this.controller.lastInput` (or `InputCommand.empty()`), then delegates weapon firing to Task 9.

**Do not** port the position integration here — that is the physics stepper's job (`physics-system.js:116-165`). `applyInput` only sets velocities/torques, exactly as the controller system does today.

TDD: feed an `InputCommand({ forward: true })`, assert `velocity.z === acceleration * dt`. Feed `{ boost: true, forward: true }`, assert doubled. Assert the `angularVelocity.z` clamp zeroes tiny values.

Commit `feat(sim): port ship control kinematics into Ship.update`.

### Task 11: Collision → damage → destruction subsystem

**Files:**
- Create: `shared/sim/subsystems/combat.js`
- Test: `test/sim/combat.test.js`

Fold today's `CollisionSystem` + `DamageSystem` + `DestroySystem` + `destroy-on-collision` + `suffer-damage` into one `CombatSubsystem.update(world)` that:
1. Reads collision pairs from `world.physics.drainCollisions()`.
2. For each pair, ports the damage rules from `server/src/systems/damage-system.js` and `collision-system.js` (read those files): a Bullet applies `damage` to what it hits and marks itself destroyed (`destroyOnCollision`); a Ship's `health` drops; at `health <= 0` the Ship is marked destroyed (and, if it has `respawn`, queued for respawn — Task 12).

Because this is pure given injected collision pairs, TDD it: build a `World` with a fake `physics` whose `drainCollisions()` returns one `{ a: bullet, b: ship }`, run the subsystem, assert `ship.health` dropped by `bullet.damage` and `bullet.destroyed === true`. Assert a ship at `health 0` gets `destroyed`.

Commit `feat(sim): port collision/damage/destroy into CombatSubsystem`.

### Task 12: Bullet timeout + respawn + spawn subsystems

**Files:**
- Modify: `shared/sim/entities/bullet.js` (timeout in `update`)
- Create: `shared/sim/subsystems/respawn.js`
- Test: extend combat/entities tests

- **Bullet timeout:** port `server/src/systems/timeout-system.js`. In `Bullet.update(dt)`, `this.ageMs += dt`; when `ageMs >= timeoutMs`, `markDestroyed()`. TDD: bullet with `timer=100` destroyed after 100ms of accumulated dt, alive before.
- **Respawn:** port `server/src/systems/spawn-system.js` + `random-spawn` + `respawn` component behaviour into a `RespawnSubsystem` that repositions/re-adds ships flagged for respawn using `Utils.getRandomPosition`. Keep the random-spawn placement identical. TDD the placement bounds if practical; otherwise verify end-to-end in Phase 2.

Commit `feat(sim): port bullet timeout and respawn`.

### Task 12b: Ship death/respawn lifecycle (DESIGN ADDENDUM)

Discovered during Task 12: the original death→respawn cycle is spread across `damage-system.js:33-52`, `timeout-system.js:23`, and `network-message-system.js`. Faithful behaviour: a ship at `health<=0` **keeps its entity slot** but loses Transform+Health (→ clients Despawn, physics body drops), then after `Respawn.timer` = **3000ms** reappears **at the death position with health 100** (→ clients Spawn). Every entity with Health is a ship, and every ship has Respawn, so **ship death is always respawn, never permanent removal**; asteroids (no Health) are indestructible; bullets self-destroy via `destroyOnCollision`+timeout.

**Design decision (ideal OOP replacement for the "strip Transform to hide it" hack):** model an explicit lifecycle on `Ship` in the sim.

- `Ship` gains `alive = true` and `respawnTimer = 0`; add a module constant `RESPAWN_DELAY = 3000` (matches `respawn.js` default).
- `Ship.update(dt, world, time)` **no-ops when `!alive`** (a dead ship neither applies input nor fires weapons).
- **CombatSubsystem (amends Task 11):** when a ship reaches `health <= 0`, set `alive = false` and `respawnTimer = RESPAWN_DELAY` — do **NOT** `markDestroyed()` (the slot must persist). Bullets still `markDestroyed()` on collision; asteroids never die. (This corrects Task 11, which currently marks dying ships `destroyed`.)
- **RespawnSubsystem (amends Task 12):** for each ship with `!alive`, `respawnTimer -= dt`; when `<= 0`, revive: `alive = true`, `health = 100`, zero `velocity`/`angularVelocity`, keep position (death spot — faithful). Keep the existing initial `randomSpawn` placement path.
- **Downstream contract — a ship is network-visible and physically present iff `alive`:**
  - **Task 14 (AmmoPhysicsWorld):** remove the body when a ship transitions `alive→false`, re-add it (at current transform) on `false→true`.
  - **Task 15 (NetworkServer):** broadcast `Despawn` on `alive→false` and `Spawn` on `false→true`; exclude `!alive` ships from the snapshot diff / world state. Dead ships stay in `world.entities` (slot preserved) — do not `despawn()` them.
- **Subsystem order (Task 13):** RespawnSubsystem runs **before** CombatSubsystem (mirrors original `SpawnSystem`-before-`DamageSystem`); a ship killed this tick begins its countdown next tick.

**End of Phase 1 gate:** `npm run test:sim` all green. The entire game *simulation* now exists in `shared/sim/` with zero ecsy imports and zero references to three.js scene/DOM. Commit the phase.

---

## Phase 2 — Server (`server/src/`)

Now wire the sim core into an authoritative server, replacing `server/src/world.js` and the 10 server systems. Physics and networking are integration-tested by running the server (`npm run server:start:dev`) — no fake unit tests for Ammo or `ws`.

### Task 13: `GameServer` skeleton (replaces `world.js`)

**Files:**
- Create: `server/src/game-server.js`
- Modify: `server/src/index.js` / `server/src/server.js` (swap `World` import for `GameServer`) — read `server/src/index.js` and `server.js` first to see how `World` is constructed and where `handlePlayerConnect` is called.

`GameServer` owns: a `World` (sim), an `AmmoPhysicsWorld` (Task 14), a `NetworkServer` (Task 15), and the fixed-timestep loop ported from `world.js:95-117` (`createFixedTimestep`, `setInterval`, delta clamp at 250ms). It wires `world.physics = physicsWorld` and registers subsystems in this order (mirrors the old `registerSystem` order in `world.js:75-86`, minus the network systems which move into `NetworkServer`):

```
world.addSubsystem(spawnSubsystem)      // RespawnSubsystem
     .addSubsystem(combatSubsystem)     // CombatSubsystem (reads physics collisions)
```
Weapon firing and control run inside `Ship.update`; physics stepping runs between entity update and subsystems — so `GameServer.tick()` is explicit:
```js
tick(dt, time) {
  // 1. apply latest inputs to ships (NetworkServer already copied them onto ships)
  for (const e of this.world.entities.values()) e.update(dt, this.world, time);
  // 2. physics: apply controls, integrate, collect collisions
  this.physics.applyAll(this.world, dt);
  this.physics.step(dt);
  // 3. subsystems: combat (uses drained collisions), respawn
  for (const s of this.world.subsystems) s.update(this.world, dt, time);
  // 4. reap + broadcast snapshot diff
  this.world.reap();
  this.network.broadcastSnapshot(this.world, time);
}
```
(Refactor `World.tick` from Task 6 so `GameServer` can interleave physics between entity-update and subsystems — expose `world.reap()` and let `GameServer` own the phase order. Update the Task 6 test accordingly.)

Verify: `npm run server:start:dev` boots and logs "running" without ecsy. Commit `feat(server): add GameServer owning sim + physics + network`.

### Task 14: `AmmoPhysicsWorld` (concrete stepper)

**Files:**
- Create: `server/src/physics/ammo-physics-world.js`

Port `server/src/systems/physics-system.js` almost verbatim — it is already 90% a plain class. Changes:
- `createWorld`, `createRigidBodyConstructionInfo`, `setupRigidBody`, `detectCollision`, `createShapeFromEntityType`, `createConvexHullShape`, asset loading in `init` → move unchanged.
- Replace `entity.getComponent(Transform)` → `entity.transform`; `entity.getComponent(RigidBody)` → the ship/asteroid/bullet fields directly; `getMutableComponent(Transform)` writes → `entity.transform.position.set(...)`.
- `queries.entities.added/removed` → explicit `add(entity)`/`remove(entity)` methods called by `GameServer` on spawn/despawn (subscribe via `world.onSpawn`/`onDespawn`).
- `body.entity = entity` and `entity.body = body` stay (attach the Ammo body to the entity object).
- `applyControls`/`applyAll(world, dt)` = the per-entity force/torque/kinematic block (`physics-system.js:87-165`).
- `detectCollision` currently mutates a `Collision` component; instead push `{ a: entity0, b: entity1 }` into an internal array that `drainCollisions()` returns and clears. The bullet-removal-on-contact behaviour (`physics-system.js:280-294`) stays.

Verify by running the server and confirming asteroids spawn (500) and the sim steps without throwing. Full behaviour is checked end-to-end in Phase 3. Commit `feat(server): port Ammo physics into AmmoPhysicsWorld stepper`.

### Task 15: `NetworkServer` (replaces network-event & network-message systems)

**Files:**
- Create: `server/src/net/network-server.js`
- Keep: `server/src/connection.js` (unchanged; it already has the input buffer + sequence tracking).

Fold `server/src/systems/network-event-system.js` and `network-message-system.js` into one `NetworkServer`:
- **Connect:** port `network-message-system.js:37-49` — on a new connection, send `Go`, then a `Spawn` for every existing entity, then flush.
- **Hello → spawn ship:** port `network-event-system.js:23-41` — sanitize name, spawn a controllable Ship via a new `spawnShip(world, connection)` (port `Spawner.controllableSpaceship`, `spawner.js:22-63`, into sim terms: `new Ship(...)`, attach two `Weapon`s, set `ship.controller = { connection, lastInput }`), reply `Welcome(ship.id, name)`.
- **Inputs:** port `network-event-system.js:43-74` — drain the connection's `inputBuffer` honouring `lastProcessedInput`, decode into an `InputCommand`, store on `ship.controller.lastInput`. Keep `lastProcessedInput` bookkeeping (reconciliation seam).
- **Spawn/despawn broadcast:** subscribe to `world.onSpawn`/`onDespawn` → `broadcast(new Messages.Spawn(...))` / `Messages.Despawn(id)` (ports `network-message-system.js:51-72`). On ship death spawn, the explosion particle is a *client* concern — server just despawns.
- **Per-tick state:** `broadcastSnapshot(world, time)` uses the `SnapshotDiffer` (Task 7) → build `Messages.World` from changed entities and push to every connection, then `sendOutgoingMessages()` (ports `network-message-system.js:74-84`). Note: `Messages.World.serialize` currently reads ecsy components (`messages.js:177-199`) — update it to accept the differ's `[{id, state}]` array and emit the same flat layout. Update `Messages.World.deserialize` only if the layout changes (it should not).

Verify: connect one real browser client (Phase 3 client not ready yet, so temporarily point the existing client at the new server OR defer full verification to Phase 3). At minimum, confirm the server accepts a WebSocket, sends `Go`+`Spawn`s, and doesn't throw on input. Commit `feat(server): add NetworkServer with snapshot-diff broadcasting`.

### Task 16: Delete server ECS

**Files:**
- Delete: `server/src/world.js`, `server/src/components/*`, `server/src/systems/*`, `server/src/spawner.js` (logic moved into sim + NetworkServer).
- Verify no remaining `from 'ecsy'` in `server/`: `grep -rn "ecsy" server/` → empty.

Verify: `npm run server:start:dev` runs clean. Commit `refactor(server): remove ecsy`.

---

## Phase 3 — Client (`client/src/`)

Replace `client/src/game.js` (ECS world) and the 10 client systems. The client keeps a **local `World`** of entities mirrored from server snapshots (no client physics yet), a presentation layer, and a `NetworkClient`. Verification is by running the game (`/run`) with two browser tabs.

### Task 17: `SceneManager` (three.js ownership)

**Files:**
- Create: `client/src/render/scene-manager.js`

Lift the three.js setup out of `game.js:130-210` verbatim: renderer, scene, camera, lights, fog, FXAA/EffectComposer/UnrealBloom, stars (`addStars`, `game.js:364-385`). Expose `scene`, `camera`, `render(alpha)`. This is a pure move — no behaviour change. Verify: the game renders an empty starfield. Commit.

### Task 18: `ViewRegistry` + entity views (model loading, meshes, interpolation)

**Files:**
- Create: `client/src/render/view-registry.js`
- Port from: `client/src/systems/model-loading-system.js`, `mesh-renderer.js`, `instanced-mesh-renderer.js`, `webgl-renderer-system.js`, `transform-system.js`.

`ViewRegistry` maps `entity.id → three.js Object3D`. On `world.onSpawn`, create the right mesh for `entity.type` (clone the loaded GLTF for ship/asteroid/bullet; port model-loading from `model-loading-system.js`). On `world.onDespawn`, remove/dispose. Each render frame, `update(alpha)` ports the interpolation from `transform-system.js` + `webgl-renderer-system.js`: lerp `prevPosition→position`, slerp `prevRotation→rotation` by `alpha`, write to the mesh. Keep `prevPosition`/`prevRotation` on the client entity (set each time a snapshot is applied — Task 20).

Verify: hardcode-spawn one ship locally and confirm it renders and interpolates. Commit `feat(client): add ViewRegistry with model loading and interpolation`.

### Task 19: Input controller + presentation services (HUD, projection, aim-assist, particles, range)

**Files:**
- Create: `client/src/input/input-controller.js`, `client/src/input/keybindings.js` (port from `components/keybindings.js` + `systems/input-system.js`)
- Create: `client/src/render/{hud,projection,aim-assist,particles,range}.js` (port from the matching `client/src/systems/*` + `shared/systems/range-system.js`)

`InputController` ports `input-system.js`: read keyboard/mouse against the keybindings (`game.js:264-281`), build an `InputCommand`, and hand it to `NetworkClient` (Task 20) to send as `Messages.Input`. The presentation services port their systems 1:1 but read the client `World`/`ViewRegistry` instead of ecsy queries; each exposes a `render()`/`update()` called from the client loop. Verify each visually. Commit per service or as one `feat(client): port input and presentation services`.

### Task 20: `NetworkClient` + client `Game` loop (replaces `game.js` ECS)

**Files:**
- Create: `client/src/net/network-client.js` (port `client/src/systems/network-event-system.js` + `network-message-system.js`)
- Rewrite: `client/src/game.js` to own `World` (sim), `SceneManager`, `ViewRegistry`, `InputController`, presentation services, and the update/render loops (`game.js:213-262`).

`NetworkClient`:
- On `Spawn` → `world.spawn(new Ship/Asteroid/Bullet(...))` (ports `game.js:283-338` `addPlayer`/`addEntity` type switch, but constructing sim entities; the `ViewRegistry` reacts via `world.onSpawn`).
- On `Despawn` → `world.despawn(id)`; if it was a ship, trigger the explosion particle (ports `game.js:340-362` `removeEntity`).
- On `World` (state) → for each `{id, position, rotation}` set the entity's `prevPosition=position(old)`, then apply new transform (ports the interpolation bookkeeping the old `transform-system` relied on).
- On `Welcome` → mark which entity id is the local player.
- Sends `Hello` on connect and `Input` each tick.

`game.js` loop: `update()` steps presentation-relevant sim (client has no physics; entities just hold the latest server transform, so the client `World.tick` mostly advances particles/HUD), `render()` calls `sceneManager.render(alpha)` + services, exactly mirroring today's split (`game.js:223-252`).

Verify end-to-end with `/run` and **two browser tabs**: both connect, see each other, fly with the keyboard, fire, collide with asteroids/each other, take damage, die, respawn; HUD + aim-assist render. Commit `feat(client): replace ECS game with OOP sim + presentation`.

### Task 21: Delete client ECS

**Files:**
- Delete: `client/src/components/*`, `client/src/systems/*`, and the old ECS body of `game.js` (now rewritten).
- Verify: `grep -rn "ecsy" client/` → empty.

Commit `refactor(client): remove ecsy`.

---

## Phase 4 — Final cleanup & verification

### Task 22: Remove ecsy dependency + shared ECS files

**Files:**
- Modify: `package.json` — remove `"ecsy"` from dependencies.
- Delete: `shared/components/*` and `shared/systems/*` that were ECS components/systems (keep `shared/messages.js`, `shared/types.js`, `shared/utils.js`, `shared/three-types.js` if still referenced, `shared/utils/create-fixed-timestep.js`). Grep each shared component for remaining importers before deleting; migrate any surviving field defaults into the sim entity classes.
- Run: `npm install` to drop ecsy from the lockfile.
- Verify repo-wide: `grep -rn "ecsy" --include=*.js . | grep -v node_modules` → empty.

Commit `chore: remove ecsy dependency`.

### Task 23: Lint + full end-to-end verification

- Run: `npm run lint` (fix any fallout — the ESLint config is `.eslintrc`).
- Run: `npm run test:sim` → all green.
- Run the game (`/run`), two tabs, full smoke test: connect, fly, boost, fire both weapons, hit an asteroid, hit another ship, confirm damage/death/respawn, confirm despawn removes the mesh, confirm HUD/aim-assist/particles. Use `/verify` to drive this.
- Optional: `npm test` (puppeteer `test/test.js`) if still relevant — read it first; update or delete if it asserted ecsy internals.

Commit any fixes. **Done when:** no `ecsy` anywhere, `test:sim` green, lint clean, and the two-tab smoke test passes with behaviour indistinguishable from today.

---

## Notes for the executor

- **Read the source you're porting.** Every "port from `X:lines`" means open X, understand it, move it. The field shapes and tuning constants must survive unchanged — this is a restructure, not a redesign of gameplay.
- **One ecsy concept → one OOP home:** components → entity fields; marker components → booleans/subclass identity; systems → either an entity method (per-entity behaviour) or a subsystem (cross-entity); reactive `added`/`removed` queries → `world.onSpawn`/`onDespawn` hooks; `changed` queries → `SnapshotDiffer`.
- **Keep the wire format.** Only `Messages.World.serialize` changes (its input shape); every serialized array stays byte-compatible so a half-migrated client/server pair still talks during Phase 2↔3 bring-up.
- **Seams for later prediction (do not build now):** `World.tick(dt)` is deterministic and physics is injected; `InputCommand.seq` + `connection.lastProcessedInput` are preserved; `World`/`Entity` serialize network state. These are what whole-world prediction + reconciliation will build on.
```
