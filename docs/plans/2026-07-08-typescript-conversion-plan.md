# TypeScript Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the entire Voidfall codebase (~7,700 LOC, 55 files across `client/`, `server/`, `shared/`, `test/`) from native-ESM JavaScript to full-strict TypeScript, with zero change to runtime behavior.

**Architecture:** Base + two-project tsconfig (`shared/` checked under both a node project and a client/DOM project). Server and tests run `.ts` directly via `tsx` (no build step); `tsc --noEmit` is the strict typecheck gate; the client already runs `.ts` through Vite. Untyped third-party edges (ammo.js, vendored three ports, a few npm packages) are isolated behind hand-written `.d.ts` declarations so no `any` reaches our code. Physics stays on ammo.js; the rapier swap is deferred.

**Tech Stack:** TypeScript (strict), tsx, Vite, three@0.126, ammo.js, ws, express, winston, typescript-eslint.

**Design doc:** `docs/plans/2026-07-08-typescript-conversion-design.md`

---

## Conventions used in every conversion task

For each file being converted, the mechanical loop is:

1. `git mv path/foo.js path/foo.ts` (preserves history).
2. Annotate: add types to fields, constructor params, method signatures, and return types. Keep `.js` import specifiers unchanged (correct for `nodenext`). Use `import type { … }` for type-only imports (required by `verbatimModuleSyntax`).
3. **RED → GREEN gate:** run the typecheck for the affected project and fix reported errors until zero:
   - node side: `npx tsc -p tsconfig.json`
   - client side: `npx tsc -p client/tsconfig.json`
4. Run the behavior tests: `npm run test:sim` — must stay green (behavior is unchanged).
5. Commit.

"No `any`" rule: our code must not use `any`. When a value comes from an untyped boundary, type it against the boundary's `.d.ts`, not `any`.

---

## Task 0: Scaffolding — deps, tsconfigs, shims, scripts

No renames yet. This stands up the toolchain so the Task 1 slice can prove it.

**Files:**
- Modify: `package.json`
- Create: `tsconfig.base.json`, `tsconfig.json`, `client/tsconfig.json`
- Create: `types/globals.d.ts` (npm shims), `types/vendored.d.ts` placeholder
- Modify: `server/nodemon.json`, `.eslintignore`, `.gitignore`

**Step 1: Install dev dependencies**

```bash
npm i -D typescript tsx @types/node @types/ws @types/express @types/sanitize-html
npm i -D @types/three@0.126 || npm i -D @types/three@0.125
```

If neither `@types/three@0.126`/`0.125` resolves, install the closest available `@types/three` ≤ 0.146 (`npm view @types/three versions`) and note the chosen version in the commit message.

**Step 2: `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "resolveJsonModule": true
  }
}
```

`allowJs: true` / `checkJs: false` lets not-yet-converted `.js` files resolve during the migration (TS still infers their export types) and lets the permanently-vendored `.js` files coexist with their `.d.ts` sidecars.

**Step 3: `tsconfig.json` (node side — server + shared + test)**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "typeRoots": ["./node_modules/@types", "./types"]
  },
  "include": ["server/**/*.ts", "shared/**/*.ts", "test/**/*.ts", "types/**/*.d.ts"]
}
```

**Step 4: `client/tsconfig.json` (client + shared)**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["node"],
    "typeRoots": ["../node_modules/@types", "../types"]
  },
  "include": ["src/**/*.ts", "../shared/**/*.ts", "../types/**/*.d.ts"]
}
```

(`Bundler` resolution here matches how Vite resolves; `shared/` is intentionally included in both projects.)

**Step 5: npm-shim declarations — `types/globals.d.ts`**

Cover only the surface actually imported. `dotenv`, `winston`, `blob-util` ship their own types — do NOT shim them.

```ts
declare module 'atob' {
  const atob: (input: string) => string;
  export default atob;
}

declare module 'cross-blob' {
  const Blob: typeof globalThis.Blob;
  export default Blob;
}

declare module 'xmlhttprequest' {
  export const XMLHttpRequest: typeof globalThis.XMLHttpRequest;
}

declare module 'winston-transport-browserconsole';
```

If, when its importer is converted, any shim proves too loose to type the call site without `any`, tighten that shim's signature to the members used — don't fall back to `any` in the call site.

**Step 6: `types/vendored.d.ts`** — create an empty file for now (sidecars for the vendored three ports are added in Task 6; keeping them next to the `.js` files is preferred, so this may stay empty).

**Step 7: Update `package.json` scripts**

```json
"scripts": {
  "client:start:dev": "vite --config client/vite.config.js",
  "client:build": "vite build --config client/vite.config.js",
  "server:start:dev": "nodemon --config server/nodemon.json server/src/index.ts",
  "server:start": "tsx server/src/index.ts",
  "postinstall": "npm run client:build",
  "start": "PRODUCTION=true npm run server:start",
  "test:sim": "tsx test/sim/index.ts",
  "typecheck": "tsc -p tsconfig.json && tsc -p client/tsconfig.json",
  "lint": "eslint . --ext .ts",
  "lint-and-fix": "eslint . --ext .ts --fix"
}
```

**Step 8: `server/nodemon.json`** — change `"ext": ".js"` to `"ext": ".ts"` and add `"exec": "tsx"`:

```json
{
  "watch": ["server/src"],
  "ext": ".ts",
  "exec": "tsx",
  "ignore": []
}
```

**Step 9: `.gitignore` / `.eslintignore`** — keep `client/*`,`server/*` ignore rules; the two vendored files stay listed in `.eslintignore` (they remain `.js`). No change needed yet beyond confirming `client/dist` stays ignored.

**Step 10: Commit**

```bash
git add -A
git commit -m "chore(ts): scaffold TypeScript toolchain (tsconfigs, tsx, shims)"
```

Note: `npm run typecheck` will still fail here (no `.ts` files yet / bare project) — that's expected; the toolchain is proven in Task 1.

---

## Task 1: De-risk vertical slice (types + transform + its test)

Prove all three toolchains before bulk renaming. If Vite can't resolve a `.js` specifier that points to a `.ts` file, fix it HERE.

**Files:**
- `git mv shared/types.js shared/types.ts`
- `git mv shared/sim/transform.js shared/sim/transform.ts`
- `git mv test/sim/transform.test.js test/sim/transform.test.ts`
- `git mv test/sim/harness.js test/sim/harness.ts`
- `git mv test/sim/index.js test/sim/index.ts`

**Step 1: `shared/types.ts`**

```ts
export const Messages = {
  GO: 0, HELLO: 1, WELCOME: 2, SPAWN: 3, DESPAWN: 4, INPUT: 5, WORLD: 6,
} as const;

export const Entities = {
  SPACESHIP: 0, ASTEROID: 1, BULLET: 2,
} as const;

export type MessageId = typeof Messages[keyof typeof Messages];
export type EntityKind = typeof Entities[keyof typeof Entities];

export default { Messages, Entities };
```

(Keeps `import Types from '.../types.js'` working everywhere; adds named exports and derived unions for the wire-protocol code.)

**Step 2: `shared/sim/transform.ts`**

```ts
import { Vector3, Quaternion } from 'three';

export interface TransformInit {
  position?: Vector3;
  rotation?: Quaternion;
  scale?: number;
}

export class Transform {
  position: Vector3;
  rotation: Quaternion;
  scale: number;
  prevPosition: Vector3;
  prevRotation: Quaternion;

  constructor({ position, rotation, scale }: TransformInit = {}) {
    this.position = position ? position.clone() : new Vector3();
    this.rotation = rotation ? rotation.clone() : new Quaternion();
    this.scale = scale ?? 1;
    this.prevPosition = this.position.clone();
    this.prevRotation = this.rotation.clone();
  }

  copy(other: Transform): this {
    this.position.copy(other.position);
    this.rotation.copy(other.rotation);
    this.scale = other.scale;
    return this;
  }
}
```

**Step 3: `test/sim/harness.ts`**

```ts
type TestFn = () => void | Promise<void>;
const tests: { name: string; fn: TestFn }[] = [];

export function test(name: string, fn: TestFn): void { tests.push({ name, fn }); }

export async function run(): Promise<void> {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ok   ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).stack}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { process.exit(1); }
}
```

**Step 4: `test/sim/index.ts`** — rename only; leave the other `import './x.test.js'` lines pointing at `.js` (they resolve fine while those files are still `.js` thanks to `allowJs`). Update `./transform.test.js` stays `.js` specifier (resolves to the new `.ts`). Convert `test/sim/transform.test.ts` by adding types only where the compiler complains; the assertions are unchanged.

**Step 5: Prove `tsc` (node project) is green for the slice**

Run: `npx tsc -p tsconfig.json`
Expected: zero errors. (Other `.js` files are inferred, not hard-checked.)

**Step 6: Prove `tsx` runs the tests**

Run: `npm run test:sim`
Expected: all sim tests pass (same output as before conversion).

**Step 7: Prove Vite resolves `.js`→`.ts`**

The client imports `shared/types.js` (now `.ts`) via `client/src/render/range.js` etc. Run:

Run: `npm run client:build`
Expected: build succeeds. If it fails with an unresolved `shared/types.js`, add to `client/vite.config.js`:

```js
resolve: { extensions: ['.ts', '.js', '.mjs', '.json'] },
```

and if still failing, add a minimal resolver that rewrites relative `.js` specifiers to `.ts` when the `.ts` exists. Re-run until the build is green. **Do not proceed to Task 2 until this step passes** — it validates the assumption the whole plan rests on.

**Step 8: Also prove the client typecheck project loads**

Run: `npx tsc -p client/tsconfig.json`
Expected: it runs (there may be errors from still-`.js` client files being inferred — acceptable; there must be no *config/resolution* errors and no errors originating in `shared/types.ts` or `transform.ts`).

**Step 9: Commit**

```bash
git add -A
git commit -m "feat(ts): convert types + transform slice; prove tsc/tsx/vite toolchain"
```

---

## Task 2: shared leaves — utils, input, weapon

**Files:** `git mv` then convert `shared/utils.js`, `shared/sim/input.js`, `shared/sim/weapon.js`. Also their tests when directly coupled: `test/sim/input.test.js`, `test/sim/weapon.test.js` (rename + annotate).

**Step 1: `shared/utils.ts`** — keep the default-export object shape. Types for the notable signatures:

```ts
import sanitizeHtml from 'sanitize-html';
import { Vector3, Quaternion } from 'three';

type Rng = () => number;

export default {
  sanitize: (string: string): string => sanitizeHtml(string),
  random: (range: number): number => Math.floor(Math.random() * range),
  getRandomPosition(size: number, rng: Rng = Math.random): Vector3 { /* unchanged body */ },
  getRandomQuaternion(rng: Rng = Math.random): Quaternion { /* unchanged body */ },
  createFixedTimestep(timestep: number, callback: (dt: number, time: number) => void):
    (delta: number, time: number) => number { /* unchanged body */ },
  randomNumberGenerator(seed: number): Rng { /* unchanged body */ },
};
```

Keep every function body byte-identical; add only annotations.

**Step 2:** Convert `input.ts` and `weapon.ts` — annotate class fields and methods. Read each file, type constructor params and public fields.

**Step 3–5:** typecheck gate (`npx tsc -p tsconfig.json` → 0 errors), `npm run test:sim` green, commit:

```bash
git commit -am "feat(ts): convert shared leaves (utils, input, weapon)"
```

---

## Task 3: shared entity + entities

**Files:** `shared/sim/entity.js` → `.ts`; `shared/sim/entities/{ship,asteroid,bullet}.js` → `.ts`. Tests: `test/sim/entity.test.js`, `test/sim/entities.test.js`.

**Guidance:** `Entity` is the base class — define its full field set as typed properties (id, type: `EntityKind`, transform: `Transform`, velocity/angularVelocity: `Vector3`, weight, damping, kinematic, alive, destroyed, `body` — type `body` as `RigidBody | null` from the ammo boundary added in Task 6; until then type it as `import('../physics/…').RigidBody | null` is not yet available, so temporarily type it as `unknown` ONLY if needed and resolve in Task 6). Prefer: define a minimal `PhysicsBody` interface in `shared/sim/entity.ts` describing the fields the sim reads (`entity` back-reference is set server-side) and let `AmmoPhysicsWorld` satisfy it. Subclasses set `type` to a specific `Entities.*`.

**Gate:** `npx tsc -p tsconfig.json` 0 errors, `npm run test:sim` green.

```bash
git commit -am "feat(ts): convert Entity and entity subclasses"
```

---

## Task 4: shared subsystems + world

**Files:** `shared/sim/subsystems/{combat,respawn}.js` → `.ts`; `shared/sim/world.js` → `.ts`. Tests: `test/sim/combat.test.js`, `test/sim/respawn.test.js`, `test/sim/world.test.js`.

**Guidance:** `World` holds `entities: Map<…, Entity>` and drives a `PhysicsWorld`. Define the `PhysicsWorld` interface here or import it from Task 5's file — sequence so `world.ts` imports the interface. Type the subsystem functions against `World`/`Entity`.

**Carry-forward from Task 3 review (must honor):**
- `World.spawn` MUST be typed generically as `spawn<T extends Entity>(entity: T): T` — otherwise `World` isn't assignable to the `EntityWorld` interface `Entity.update`/`Ship.update` depend on, and `e.update(dt, this, time)` in `world.tick` fails. Sound, since `spawn` returns its argument.
- `entity.id` is `number | undefined` (entities get an id only at spawn). At `world.js` `despawn(e.id)` and any `e.id` read where the entity is known-spawned, narrow/assert rather than widening the field. Same applies to `snapshot.ts` in Task 5 (`seen.add(e.id)`, `{ id: e.id }`).

**Gate + commit:**

```bash
git commit -am "feat(ts): convert combat/respawn subsystems and World"
```

---

## Task 5: shared net + physics-world interface

**Files:** `shared/sim/physics/physics-world.js` → `.ts`; `shared/messages.js` → `.ts`; `shared/sim/net/snapshot.js` → `.ts`. Test: `test/sim/snapshot.test.js`, `test/sim/physics-contract.test.js`.

**Step 1: `shared/sim/physics/physics-world.ts`** — turn the contract into a real interface plus the null impl:

**Carry-forward from Task 4 review (must honor):** `Collision.b` is non-nullable `Entity`, NOT `Entity | undefined`. `combat.ts` reads `b.destroyOnCollision`/`b.markDestroyed()`/`dealDamage(b,a,…)` unconditionally, and at runtime every world body is added via `add()` which sets `body.entity` (there are no static/entity-less bodies), so `b` is always defined. Do NOT widen it — that would force spurious guards back into `combat.ts`. Task 6's `detectCollision` satisfies this with a non-null assertion at the push sites (see Task 6). Also: `world.ts` (Task 4) already defines a local `Collision`/`PhysicsWorld`; optionally have `world.ts` import these from `physics-world.ts` here to dedupe (only if it stays strict-green and keeps `world.physics` assignable from the `drainCollisions`-only test doubles).

```ts
import type { Entity } from '../entity.js';

export interface Collision { a: Entity; b: Entity; }

export interface PhysicsWorld {
  add(entity: Entity): void;
  remove(entity: Entity): void;
  applyControls?(entity: Entity, dt: number): void;
  step(dt: number): void;
  drainCollisions(): Collision[];
}

export class NullPhysicsWorld implements PhysicsWorld {
  add(_entity: Entity): void {}
  remove(_entity: Entity): void {}
  applyControls(_entity: Entity, _dt: number): void {}
  step(_dt: number): void {}
  drainCollisions(): Collision[] { return []; }
}
```

(`AmmoPhysicsWorld` in Task 6 will `implements PhysicsWorld`. Confirm the real method surface — `AmmoPhysicsWorld` uses `applyAll(world, delta)` rather than per-entity `applyControls`; reconcile the interface with actual call sites in `world.ts` so the interface matches how `World` drives the stepper. Adjust the interface to the true contract, do not force the code to fit a guessed interface.)

**Step 2:** Convert `messages.ts` and `snapshot.ts` — these do binary (de)serialization over `ArrayBuffer`/`DataView`/typed arrays. Type buffer params as `ArrayBuffer`/`DataView`/`Uint8Array` precisely; use `MessageId`/`EntityKind` from `types.ts` for tags.

**Gate + commit:**

```bash
git commit -am "feat(ts): convert physics-world interface, messages, snapshot"
```

---

## Task 6: server physics — ammo boundary + AmmoPhysicsWorld + vendored sidecars

The biggest single boundary. **Read `server/src/physics/ammo-physics-world.js` fully before starting.**

**Files:**
- Create: `server/src/physics/ammo.d.ts`
- Create: `server/src/gltf-loader.d.ts`, `server/src/buffer-geometry-utils.d.ts` (sidecars; the `.js` files stay `.js`)
- `git mv server/src/physics/ammo-physics-world.js` → `.ts`

**Step 1: `server/src/physics/ammo.d.ts`** — declare only the surface used. Enumerate from the source; the set is:

```ts
declare module 'ammo.js' {
  export interface btVector3 {
    x(): number; y(): number; z(): number;
    setX(x: number): void; setY(y: number): void; setZ(z: number): void;
    setValue(x: number, y: number, z: number): void;
  }
  export interface btQuaternion {
    x(): number; y(): number; z(): number; w(): number;
    setValue(x: number, y: number, z: number, w: number): void;
  }
  export interface btMatrix3x3 { getRotation(q: btQuaternion): void; }
  export interface btTransform {
    setIdentity(): void;
    setOrigin(v: btVector3): void; getOrigin(): btVector3;
    setRotation(q: btQuaternion): void;
    getBasis(): btMatrix3x3;
  }
  export interface btMotionState {
    getWorldTransform(t: btTransform): void;
    setWorldTransform(t: btTransform): void;
  }
  export interface btCollisionShape {
    setLocalScaling(v: btVector3): void;
    calculateLocalInertia(mass: number, inertia: btVector3): void;
  }
  export interface btConvexHullShape extends btCollisionShape { addPoint(p: btVector3): void; }
  export interface btCollisionObject {
    isStaticObject(): boolean; isActive(): boolean;
    getCollisionFlags(): number; setCollisionFlags(f: number): void;
    setActivationState(s: number): void;
  }
  export interface btRigidBody extends btCollisionObject {
    // App-attached back-reference. Type it as the shared `Entity` (server-side
    // .d.ts importing shared IS the correct direction; only ammo→shared is the
    // protected boundary). Confirmed: `unknown` breaks the `entity.body = body`
    // assignment; `Entity` compiles both that and `const body = entity.body as
    // btRigidBody` reads with zero `any`.
    // IMPORTANT: reference Entity via an INLINE import type, NOT a top-level
    // `import` — a top-level import makes this file a module, which turns
    // `declare module 'ammo.js'` into an AUGMENTATION of the untyped package
    // (TS7016 implicit-any). Keep ammo.d.ts a global ambient script:
    entity?: import('../../../shared/sim/entity.js').Entity;
    getMotionState(): btMotionState | null;
    applyCentralLocalForce(v: btVector3): void;
    applyLocalTorque(v: btVector3): void;
    setRestitution(r: number): void; setFriction(f: number): void;
    setDamping(lin: number, ang: number): void;
    setSleepingThresholds(lin: number, ang: number): void;
    setLinearVelocity(v: btVector3): void; setAngularVelocity(v: btVector3): void;
    setCcdMotionThreshold(t: number): void; setCcdSweptSphereRadius(r: number): void;
  }
  export interface btManifoldPoint { getDistance(): number; }
  export interface btPersistentManifold {
    getBody0(): btCollisionObject; getBody1(): btCollisionObject;
    getNumContacts(): number; getContactPoint(i: number): btManifoldPoint;
  }
  export interface btDispatcher {
    getNumManifolds(): number; getManifoldByIndexInternal(i: number): btPersistentManifold;
  }
  export interface btDiscreteDynamicsWorld {
    setGravity(v: btVector3): void;
    addRigidBody(b: btRigidBody): void; removeRigidBody(b: btRigidBody): void;
    stepSimulation(dt: number, maxSubSteps: number, fixedTimeStep: number): void;
    getDispatcher(): btDispatcher;
  }
  export interface btRigidBodyConstructionInfo { _brand?: never; }

  export interface AmmoModule {
    btVector3: new (x?: number, y?: number, z?: number) => btVector3;
    btQuaternion: new (x: number, y: number, z: number, w: number) => btQuaternion;
    btTransform: new () => btTransform;
    btDefaultMotionState: new (t: btTransform) => btMotionState;
    btBoxShape: new (halfExtents: btVector3) => btCollisionShape;
    btConvexHullShape: new () => btConvexHullShape;
    btDefaultCollisionConfiguration: new () => object;
    btCollisionDispatcher: new (config: object) => btDispatcher;
    btDbvtBroadphase: new () => object;
    btSequentialImpulseConstraintSolver: new () => object;
    btDiscreteDynamicsWorld: new (
      dispatcher: btDispatcher, broadphase: object, solver: object, config: object,
    ) => btDiscreteDynamicsWorld;
    btRigidBodyConstructionInfo: new (
      mass: number, motionState: btMotionState, shape: btCollisionShape, localInertia: btVector3,
    ) => btRigidBodyConstructionInfo;
    btRigidBody: new (info: btRigidBodyConstructionInfo) => btRigidBody;
    castObject<T>(obj: unknown, type: new (...args: never[]) => T): T;
    destroy(obj: object): void;
  }

  const Ammo: () => Promise<AmmoModule>;
  export default Ammo;
}
```

Adjust exact member signatures if the compiler flags a mismatch against real usage — extend this file, never fall back to `any` in `ammo-physics-world.ts`.

**Step 2:** Convert `ammo-physics-world.ts`. Type `this.ammo: AmmoModule`, shapes map, and `implements PhysicsWorld` (reconciled interface from Task 5). At the `castObject`/`.entity` boundary, cast the attached entity to `Entity` once at read sites.

**Carry-forward from Task 4 review (must honor):** In `detectCollision`, `entity1`/`entity0` are inferred `Entity | undefined` (because `PhysicsBody.entity`/the ammo back-ref are optional) and are NOT narrowed at the `{ a: entity0, b: entity1 }` push sites. Satisfy `Collision.b: Entity` with a **non-null assertion at the push site** (`b: entity1!`, and `b: entity0!` in the symmetric push) — the assertion encodes the real invariant that every world body carries `.entity`. Do NOT widen `Collision.b`, and do NOT add a runtime guard (that would change the byte-identical body). The `this.collisions` field is typed `Collision[]`.

**Step 3: Vendored sidecars.** `server/src/gltf-loader.d.ts` and `server/src/buffer-geometry-utils.d.ts` declaring only the exports `asset-manager` uses (`GLTFLoader`, `BufferGeometryUtils`). Example:

```ts
// server/src/gltf-loader.d.ts
import type { LoadingManager, Group } from 'three';
export class GLTFLoader {
  constructor(manager?: LoadingManager);
  load(url: string, onLoad: (gltf: { scene: Group }) => void,
       onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void): void;
}
```

(Match the real exported names/shapes — read the two `.js` files' `export` lines first.)

**Step 4: Gate** — `npx tsc -p tsconfig.json` 0 errors, `npm run test:sim` green (physics-contract test proves behavior unchanged).

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(ts): type ammo boundary + convert AmmoPhysicsWorld; vendored sidecars"
```

---

## Task 7: server — net, connection, asset-manager, game-server, server, index, logger

**Files (convert bottom-up):** `server/src/utils/logger.js`, `server/src/net/network-server.js`, `server/src/connection.js`, `server/src/asset-manager.js`, `server/src/game-server.js`, `server/src/server.js`, `server/src/index.js` → `.ts`.

**Guidance:**
- `logger.ts` — trivial; winston ships types.
- `network-server.ts` / `server.ts` — type `ws` (`WebSocket`, `WebSocketServer` from `@types/ws`) and `express` handlers.
- `index.ts` — `process.env.*` is `string | undefined`; keep the existing `+process.env.PORT || 1337` coercion; guard `process.env.WORLDS`/`PLAYERS_PER_WORLD` reads with `Number(...)`/defaults so the loop bounds are `number`.
- `asset-manager.ts` — consumes the vendored sidecars from Task 6.

**Gate:** `npx tsc -p tsconfig.json` 0 errors; `npm run test:sim` green; **boot check:** `PORT=1337 WORLDS=1 PLAYERS_PER_WORLD=4 npx tsx server/src/index.ts` starts without error (Ctrl-C to stop).

```bash
git commit -am "feat(ts): convert server (net, connection, assets, game-server, index)"
```

---

## Task 8: client render layer

**Files:** `client/src/render/{aim-assist,hud,particles,projection,range,scene-manager,view-registry}.js` → `.ts`.

**Guidance:** These use three heavily (`@types/three` covers `three` and `three/examples/jsm/*`). Type DOM interactions against the `DOM` lib. Convert leaves (`aim-assist`, `range`, `projection`) before `scene-manager`/`view-registry`.

**Gate:** `npx tsc -p client/tsconfig.json` 0 errors for converted files; `npm run client:build` succeeds.

```bash
git commit -am "feat(ts): convert client render layer"
```

---

## Task 9: client — input, net, connection, game, index, worker

**Files:** `client/src/input/{input-controller,keybindings}.js`, `client/src/net/network-client.js`, `client/src/connection.js`, `client/src/game.js`, `client/src/index.js`, `client/src/interval.worker.js`, `client/src/worker-interval.js` → `.ts`.

**Guidance:** The web worker (`interval.worker.ts`) relies on the `WebWorker` lib (`self`, `postMessage`) already in `client/tsconfig.json`. Verify Vite's worker import mechanism still resolves after rename (`new Worker(new URL('./interval.worker.ts', import.meta.url), { type: 'module' })` or `?worker` suffix — match whatever `worker-interval.js` currently does; update the specifier to `.ts` if the current one hard-codes `.js`).

**Gate:** `npx tsc -p client/tsconfig.json` 0 errors; `npm run client:build` succeeds; sanity-run `npm run client:start:dev` and confirm no console resolution errors.

```bash
git commit -am "feat(ts): convert client input/net/game/index/worker"
```

---

## Task 10: remaining test files

**Files:** any `test/sim/*.test.js` not yet converted → `.ts`. Confirm `test/sim/index.ts` imports all use specifiers that resolve. `test/test.cjs` (puppeteer, not part of `test:sim`) stays `.cjs` — out of scope.

**Gate:** `npm run test:sim` green; `npx tsc -p tsconfig.json` 0 errors.

```bash
git commit -am "feat(ts): convert remaining sim tests"
```

---

## Task 11: eslint migration + final gate + cleanup

**Files:** `.eslintrc`, `package.json`, `.eslintignore`, `tsconfig.base.json`.

**Step 1: typescript-eslint**

```bash
npm i -D typescript-eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

Update `.eslintrc` to use the TS parser + plugin, keep the existing style rules (single quotes, 2-space indent, semi, curly), and replace `no-unused-vars` with `@typescript-eslint/no-unused-vars` (same `argsIgnorePattern`/`varsIgnorePattern`). Keep the two vendored `.js` files in `.eslintignore`.

**Step 2:** Run `npm run lint` (now `--ext .ts`) → fix to clean.

**Step 3: Tighten** — now that only the two vendored files remain `.js`, confirm `allowJs: true`/`checkJs: false` is still required (it is, for those two). Leave as-is.

**Step 3b: Deps hygiene (from Task 7 review)** — `@types/ws` was installed unpinned and resolved to `8.x`, but the runtime dep is `ws@7`. Pin it to match: `npm i -D @types/ws@^7`. Then re-run typecheck; the `message` handler's `Data` type now includes `string` honestly and the `WebSocket.Server` cast in `server.ts` can likely be removed (verify — ws@7 types surface `.Server` on the default import). If removing the cast isn't clean, leave it. Do NOT let this regress the strict-green state.

**Step 4: Full verification gate — all must pass:**

```bash
npm run typecheck        # tsc -p tsconfig.json && tsc -p client/tsconfig.json — 0 errors, strict
npm run test:sim         # all sim tests pass via tsx
npm run client:build     # Vite build succeeds
npm run lint             # typescript-eslint clean
PORT=1337 WORLDS=1 PLAYERS_PER_WORLD=4 npx tsx server/src/index.ts   # server boots, then Ctrl-C
```

**Step 5:** Grep for stragglers — `git ls-files '*.js'` should list only the two vendored ports, `client/vite.config.js`, `ecosystem.config.cjs`, `test/test.cjs`, and any config `.js`. Confirm no source `.js` remains.

**Step 6: Commit**

```bash
git commit -am "chore(ts): migrate eslint to typescript-eslint; final verification"
```

---

## Done criteria

- Every source file under `client/src`, `server/src`, `shared/`, `test/sim` is `.ts` (except the two vendored three ports, which keep `.js` + `.d.ts` sidecars).
- `npm run typecheck` passes strict with zero `any` in our code.
- `npm run test:sim`, `npm run client:build`, `npm run lint` all pass.
- Server boots via `tsx`.
- Gameplay behavior unchanged (physics-contract + sim tests green throughout).
- The `PhysicsWorld` interface is the clean seam for the deferred rapier swap.
