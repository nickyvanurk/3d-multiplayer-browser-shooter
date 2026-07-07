# Client build migration: webpack 4 → Vite

**Date:** 2026-07-08
**Goal:** Revive the project on modern Node (22). The webpack 4 toolchain fails
on Node 17+ with `error:0308010C:digital envelope routines::unsupported`
(OpenSSL 3 vs. webpack 4's hashing). Replace webpack with Vite so the client
builds and runs natively, with no `--openssl-legacy-provider` workaround.

## Scope

Vite owns the **client bundle only**. The server keeps its `babel-node` setup
unchanged; Vite never touches it.

## Why this is a clean migration

- Models/textures are loaded at **runtime** by three.js from relative paths
  (`models/fighter.glb`, `textures/spaceship.png`) — not bundled. They live in
  Vite's `publicDir`, served at `/` in dev and copied to `dist/` on build, so
  the loader paths work unchanged.
- No custom web workers (only the `worker-interval` npm package).
- No `ammo.js` usage in the client.
- No Node builtins imported in `client/src` or `shared/`.
- Env usage is a single line in `connection.js`.

## Directory structure

```
client/
  index.html          # moved from src/, Vite entry (root = client/)
  vite.config.js      # new
  public/             # Vite publicDir — committed models/ + textures/
  src/                # unchanged source
  dist/               # build output (gitignored), served by express in prod
  webpack.*.js        # deleted
```

## Changes

- **Deps:** remove webpack + all loaders/plugins; add `vite` (v5). `.babelrc`
  and `@babel/*` stay for the server.
- **`client/vite.config.js`:** `root: client`, `publicDir: public`,
  `build.outDir: dist`, `server.fs.allow: ['..']` (client imports
  `../../shared`).
- **`client/index.html`:** moved to `client/` root, hardcoded title,
  `<script type="module" src="/src/index.js">`.
- **`client/src/connection.js`:** `process.env.NODE_ENV === 'development'` →
  `import.meta.env.DEV`.
- **`package.json` scripts:** `client:start:dev` → `vite`,
  `client:build` → `vite build`. OpenSSL workaround gone.
- **`server/src/server.js`:** serve `client/dist` instead of `client/public`.
- **`.gitignore`:** ignore `client/dist`; keep the models/textures whitelist.

## Risks / verification

1. `worker-interval` under Vite's dep pre-bundling — smoke-test that the game
   loop actually ticks.
2. `../../shared` resolution via `server.fs.allow`.

Verify with a real `vite build` **and** loading the running game in a browser
(server + client), not just a green build.
