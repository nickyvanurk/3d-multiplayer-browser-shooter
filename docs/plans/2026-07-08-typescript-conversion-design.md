# TypeScript Conversion — Design

Date: 2026-07-08

## Goal

Convert the entire Voidfall codebase (~7,700 LOC across `client/`, `server/`,
`shared/`, `test/`) from native-ESM JavaScript to **full-strict TypeScript**.
This is a pure typing/tooling change — gameplay behavior is byte-for-byte
unchanged, proven by the existing `physics-contract` and sim tests staying green.

## Decisions

- **Strictness:** full `strict: true` (`noImplicitAny`, `strictNullChecks`, …).
  No `any` in our own code; untyped third-party edges are isolated behind typed
  boundaries.
- **Physics:** keep `ammo.js` for this conversion; the planned move to `rapier.js`
  is deferred to a separate, isolated change. Switching engines is a behavioral
  change (new solver, re-tuning, re-validating physics-contract tests) and must
  not be mixed into a type migration. The abstract `PhysicsWorld` seam is where
  rapier plugs in later.
- **Runtime:** no build step for the server. Run server + tests directly from
  `.ts` via `tsx`. `tsc --noEmit` is the strict typecheck gate. The client
  already runs `.ts` natively through Vite.

## Tooling & config

New devDependencies: `typescript`, `tsx`, `@types/node`, `@types/three@~0.126`,
`@types/ws`, `@types/express`, `@types/sanitize-html`. `dotenv`, `winston`,
`blob-util` ship their own types. Small `declare module` shims cover the rest
(`atob`, `xmlhttprequest`, `cross-blob`, `winston-transport-browserconsole`).

tsconfig layout — base plus two environment configs, so `client` and `server`
get correct `lib`/globals and `shared/` is checked under **both** (an accidental
`window` in shared then fails the server build):

- `tsconfig.base.json` — `strict`, `target: ES2022`, `moduleResolution: nodenext`,
  `skipLibCheck`, `noEmit`, `verbatimModuleSyntax`. No `include`.
- `tsconfig.json` (node side) — extends base; includes `server/`, `shared/`,
  `test/`; `lib: ["ES2022"]`, `types: ["node"]`.
- `client/tsconfig.json` — extends base; includes `client/`, `shared/`;
  `lib: ["ES2022","DOM","DOM.Iterable","WebWorker"]`, `moduleResolution: bundler`.

Scripts: `typecheck` runs both `tsc` projects (`--noEmit`) — the strict gate.
`test:sim` → `tsx test/sim/index.ts`. `server:start[:dev]` → `tsx server/src/index.ts`
(nodemon watches `.ts`). Client scripts unchanged. `lint` migrates to
`typescript-eslint` keeping existing style rules.

Import extensions: keep the `.js` specifiers — the correct TS `nodenext`
convention (`.js` resolves to `.ts` at compile time); tsx and node honor it. Vite's
resolution of `.js`→`.ts` is verified on a one-file slice before bulk renaming.

## Type modeling & boundaries

- `shared/types.js` stays a default export but becomes `as const`; wire-protocol
  unions are derived from it (`typeof Types.Messages[keyof …]`).
- Sim is already OOP classes — conversion is annotating fields, constructor params,
  and method signatures across `Entity`, `Transform`, `World`, the entities,
  `Input`, `Weapon`, the `combat`/`respawn` subsystems, and the `snapshot`/`messages`
  binary (de)serializers.
- `physics-world.js` becomes a real abstract `PhysicsWorld` interface implemented
  by `AmmoPhysicsWorld` (and later the rapier world).

Untyped boundaries (no `any` reaches our code):

1. **ammo.js** → hand-written `server/src/physics/ammo.d.ts` declaring the ~14
   `bt*` constructors used and `Ammo(): Promise<AmmoModule>`. Scoped to physics.
2. **Vendored three ports** (`gltf-loader.js`, `buffer-geometry-utils.js`,
   server-only, already eslint-ignored) → stay `.js` (`allowJs: true`) with a
   `.d.ts` sidecar declaring only their public exports.
3. **Small untyped deps** → minimal `declare module` shims in `types/`.

`three@0.126` → `@types/three` at the matching version (also covers the
`three/examples/jsm/*` client imports).

## Conversion order

1. **De-risk slice:** convert `shared/types` + `shared/sim/transform` +
   `test/sim/transform.test`; stand up tsconfigs; prove `tsc` strict, `tsx` test
   run, and `vite build` all green. Fix any Vite `.js`→`.ts` resolution issue here.
2. **`shared/`** bottom-up: types, utils → transform, input, weapon → entity →
   entities → subsystems → world → messages, snapshot, physics-world interface.
3. **`server/`**: physics (`ammo.d.ts` + `AmmoPhysicsWorld`), net, connection,
   asset-manager, game-server, server, index.
4. **`client/`**: render/*, input/*, net, connection, game, index, web worker.
5. **`test/`**: `.test.ts` files + harness.

Each file: `git mv .js .ts` (preserve history), annotate, keep `.js` specifiers.
`test.cjs` (puppeteer, not part of `test:sim`) stays as-is.

## Verification gate (all must pass)

- `tsc -p tsconfig.json` and `tsc -p client/tsconfig.json` — zero errors, strict.
- `npm run test:sim` — all sim tests pass via tsx (behavior unchanged).
- `npm run client:build` — Vite build succeeds.
- Server boots via `tsx server/src/index.ts`.
- `npm run lint` — typescript-eslint clean.
