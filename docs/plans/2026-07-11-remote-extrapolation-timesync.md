# Remote Entity Extrapolation via Time Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Synchronize the client clock to the server and use it to place every dynamic remote entity at its true present position by extrapolating each snapshot forward by `serverNow() − snapshotTime`.

**Architecture:** Port the NetStorm/TrinityCore `TimeSyncManager` (clock-delta estimator) from the gaming-platform project. Add dedicated `PING`/`PONG` messages driven by a ~1 Hz client loop to feed it. Stamp every `WORLD` snapshot with the server clock. In `applyWorldState`, advance each entity's pose by the measured snapshot age (clamped/floored); for physics-bodied ships the one-time receipt jump composes exactly with the existing Rapier coast, so no per-frame extrapolation code is needed.

**Tech Stack:** TypeScript, `three` (Vector3/Quaternion math), Rapier (client physics), custom `tsx`-run sim test harness (`test/sim/harness.ts`), Node `performance.now()` on the server, browser `performance.now()` on the client.

**Design doc:** `docs/plans/2026-07-10-remote-extrapolation-timesync-design.md`

**Conventions:**
- Tests: `import { test } from './harness.ts'`, `import assert from 'node:assert/strict'`. Register each new test file in `test/sim/index.ts`. Run with `npm run test:sim`.
- Comments sparingly; only complex code (per repo CLAUDE.md).
- Do NOT start dev servers. Verify via `npm run test:sim` and `npm run typecheck` only.
- Commit after each task (TDD: red → green → commit).

---

## Task 1: Port TimeSyncManager (pure clock math)

**Files:**
- Create: `shared/sim/net/time-sync.ts`
- Test: `test/sim/time-sync.test.ts`
- Modify: `test/sim/index.ts` (register the new test file)

**Step 1: Write the failing test**

Create `test/sim/time-sync.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { TimeSyncManager } from '../../shared/sim/net/time-sync.ts';
import { test } from './harness.ts';

// onTimeResponse(sentTime, serverTime, receiveTime):
//   latency = (receiveTime - sentTime) / 2
//   delta   = serverTime - receiveTime + latency

test('first sample is adopted immediately (right ballpark at once)', () => {
  const ts = new TimeSyncManager();
  assert.equal(ts.isSynced(), false);
  // sent=0 recv=100 -> latency 50; server=1050 -> delta = 1050 - 100 + 50 = 1000
  ts.onTimeResponse(0, 1050, 100);
  assert.equal(ts.isSynced(), true);
  assert.equal(ts.getClockDelta(), 1000);
});

test('a latency spike is filtered out of the averaged delta', () => {
  const ts = new TimeSyncManager();
  // Five clean samples: latency 50, delta 1000.
  for (let i = 0; i < 5; i++) {
    const sent = i * 1000;
    const recv = sent + 100;
    ts.onTimeResponse(sent, recv + 950, recv); // server = recv + 950 -> delta 1000
  }
  // One retransmit spike: latency 300, delta 1200. Should be discarded, so the
  // delta stays 1000 (spike would otherwise pull the mean up).
  ts.onTimeResponse(6000, 6000 + 600 + 900, 6000 + 600);
  assert.equal(ts.getClockDelta(), 1000);
});

test('sub-hysteresis wobble does not re-adopt a new delta', () => {
  const ts = new TimeSyncManager();
  for (let i = 0; i < 6; i++) {
    const sent = i * 1000;
    const recv = sent + 100;
    ts.onTimeResponse(sent, recv + 950, recv); // delta 1000
  }
  const before = ts.getClockDelta();
  // A sample implying delta ~1010 (< 25ms move) must not shift the adopted delta.
  ts.onTimeResponse(7000, 7000 + 100 + 960, 7000 + 100); // delta ~1010
  assert.equal(ts.getClockDelta(), before);
});

test('reset clears all sync state', () => {
  const ts = new TimeSyncManager();
  ts.onTimeResponse(0, 1050, 100);
  ts.reset();
  assert.equal(ts.isSynced(), false);
  assert.equal(ts.getClockDelta(), 0);
  assert.equal(ts.getSampleCount(), 0);
});

test('serverNow adds the clock delta to the local clock', () => {
  const ts = new TimeSyncManager();
  ts.onTimeResponse(0, 1050, 100); // delta 1000
  const now = ts.serverNow();
  // serverNow = performance.now() + 1000; assert only the delta contribution.
  assert.ok(now > 1000);
});
```

Add to `test/sim/index.ts` (with the other imports, keep alphabetical-ish grouping near the net tests):

```typescript
import './time-sync.test.ts';
```

**Step 2: Run to verify it fails**

Run: `npm run test:sim`
Expected: FAIL — cannot find module `../../shared/sim/net/time-sync.ts`.

**Step 3: Write minimal implementation**

Create `shared/sim/net/time-sync.ts` — ported verbatim from gaming-platform (`packages/game-client-sdk/src/utils/timeSync.ts`), minus the exported singleton (voidfall uses a per-connection instance):

```typescript
/**
 * Client/server clock synchronisation using the NetStorm algorithm
 * (Zachary Booth Simpson, http://www.mine-control.com/zack/timesync/timesync.html),
 * the same approach as TrinityCore's WorldSession::ComputeNewClockDelta().
 *
 * Per sample: latency = RTT/2, clockDelta = serverTime - receiveTime + latency.
 * Keep a bounded rolling window; discard samples with latency > median + 1 stddev
 * (eliminates transport spikes); arithmetic-mean the survivors' deltas. The first
 * sample is used immediately so the clock is in the right ballpark at once. A 25ms
 * hysteresis avoids re-adopting tiny delta wobble.
 */
interface Sample {
  latency: number;
  delta: number;
}

const WINDOW = 6; // bounded rolling window (TrinityCore uses a circular_buffer(6))
const HYSTERESIS_MS = 25; // only adopt a new delta when it moves more than this

export class TimeSyncManager {
  private readonly samples: Sample[] = []; // ring buffer; write index wraps at WINDOW
  private writeIndex = 0;
  private clockDelta = 0;
  private synced = false;

  onTimeResponse(sentTime: number, serverTime: number, receiveTime: number): void {
    const latency = (receiveTime - sentTime) / 2;
    const delta = serverTime - receiveTime + latency;

    this.samples[this.writeIndex % WINDOW] = { latency, delta };
    this.writeIndex++;

    if (!this.synced) {
      this.clockDelta = delta;
      this.synced = true;
      return;
    }

    const filtered = this.computeFilteredDelta();
    if (Math.abs(filtered - this.clockDelta) > HYSTERESIS_MS) {
      this.clockDelta = filtered;
    }
  }

  private computeFilteredDelta(): number {
    const latencies = this.samples.map((s) => s.latency).sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance =
      latencies.reduce((a, l) => a + (l - mean) ** 2, 0) / latencies.length;
    const stdDev = Math.sqrt(variance);

    // `<=` (not `<`): on a steady connection successive latencies are equal so
    // stdDev is 0; a strict `<` would exclude every sample.
    const kept = this.samples.filter((s) => s.latency <= median + stdDev);
    if (kept.length === 0) return this.clockDelta;
    return kept.reduce((a, s) => a + s.delta, 0) / kept.length;
  }

  /** Clear all sync state. Call on (re)connect — a new server has an unrelated
   * performance.now() origin, so old samples/delta must be discarded. */
  reset(): void {
    this.samples.length = 0;
    this.writeIndex = 0;
    this.clockDelta = 0;
    this.synced = false;
  }

  /** Client estimate of the server's clock right now. */
  serverNow(): number {
    return performance.now() + this.clockDelta;
  }

  getClockDelta(): number {
    return this.clockDelta;
  }
  isSynced(): boolean {
    return this.synced;
  }
  getSampleCount(): number {
    return this.samples.length;
  }
}
```

**Step 4: Run to verify it passes**

Run: `npm run test:sim`
Expected: PASS (all new time-sync tests green; 135 prior tests still pass).

**Step 5: Commit**

```bash
git add shared/sim/net/time-sync.ts test/sim/time-sync.test.ts test/sim/index.ts
git commit -m "Add NetStorm TimeSyncManager (ported from gaming-platform)"
```

---

## Task 2: PING/PONG message tags + classes

**Files:**
- Modify: `shared/types.ts` (add `PING`, `PONG` tags)
- Modify: `shared/messages.ts` (add `Ping`, `Pong` classes; export both)
- Test: `test/sim/messages.test.ts` (append cases) — verify path/name of existing messages test first with `ls test/sim/messages.test.ts`

**Step 1: Write the failing test**

Append to `test/sim/messages.test.ts` (match the file's existing import style; it already imports `Messages` and `test`):

```typescript
test('Ping round-trips the client send time', () => {
  const wire = new Messages.Ping(1234.5).serialize();
  assert.deepEqual(wire, [Types.Messages.PING, 1234.5]);
  const data = Messages.Ping.deserialize(wire.slice(1) as number[]);
  assert.equal(data.sentTime, 1234.5);
});

test('Pong echoes sentTime and carries serverTime', () => {
  const wire = new Messages.Pong(1234.5, 9000).serialize();
  assert.deepEqual(wire, [Types.Messages.PONG, 1234.5, 9000]);
  const data = Messages.Pong.deserialize(wire.slice(1) as number[]);
  assert.equal(data.sentTime, 1234.5);
  assert.equal(data.serverTime, 9000);
});
```

If `test/sim/messages.test.ts` does not already import `Types`, add `import Types from '../../shared/types.ts';` at the top.

**Step 2: Run to verify it fails**

Run: `npm run test:sim`
Expected: FAIL — `Messages.Ping is not a constructor`.

**Step 3: Write minimal implementation**

In `shared/types.ts`, add after `OREDROP: 13,`:

```typescript
  // Clock sync. PING (client->server): client send time. PONG (server->client):
  // echoed send time + server clock. Feeds TimeSyncManager.
  PING: 14,
  PONG: 15,
```

In `shared/messages.ts`, add two classes (place them after `Fire`, before `World`):

```typescript
// Client -> server: a clock-sync probe carrying the client's performance.now()
// at send. The server echoes it back in a Pong.
export class Ping {
  sentTime: number;

  constructor(sentTime: number) {
    this.sentTime = sentTime;
  }

  static deserialize(message: number[]) {
    return { sentTime: message[0] };
  }

  serialize() {
    return [Types.Messages.PING, this.sentTime];
  }
}

// Server -> client: the echoed client send time plus the server's clock at
// reply. The client computes latency + clock delta from (sentTime, serverTime,
// receiveTime).
export class Pong {
  sentTime: number;
  serverTime: number;

  constructor(sentTime: number, serverTime: number) {
    this.sentTime = sentTime;
    this.serverTime = serverTime;
  }

  static deserialize(message: number[]) {
    return { sentTime: message[0], serverTime: message[1] };
  }

  serialize() {
    return [Types.Messages.PONG, this.sentTime, this.serverTime];
  }
}
```

Add `Ping, Pong` to the default export at the bottom of `shared/messages.ts`:

```typescript
export default { Go, Hello, Welcome, Spawn, Despawn, State, Fire, World, Ping, Pong /* plus any mining messages already present */ };
```

> NOTE: the default export currently lists the mining messages too — preserve every existing entry and just append `Ping, Pong`.

**Step 4: Run to verify it passes**

Run: `npm run test:sim`
Expected: PASS.

**Step 5: Commit**

```bash
git add shared/types.ts shared/messages.ts test/sim/messages.test.ts
git commit -m "Add PING/PONG clock-sync messages"
```

---

## Task 3: Server replies to PING with PONG

**Files:**
- Modify: `server/src/connection.ts` (parse `PING`, capture nothing — reply immediately)
- Modify: `server/src/net/network-server.ts` (`processIncoming`: drain ping requests, push `Pong` with server clock)

**Approach:** The server clock echoed in `PONG` must be `performance.now()` at reply. `processIncoming` already receives `time` (the tick's server clock) and iterates connections; reply there. Buffer the requested send-times on the connection like `fireQueue`.

**Step 1: Write the failing test**

Create `test/sim/ping-server.test.ts`:

```typescript
import assert from 'node:assert/strict';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import { test } from './harness.ts';

// A minimal fake Connection exposing just what NetworkServer.processIncoming
// touches for the ping path.
function fakeConnection(id: number) {
  const outgoing: unknown[][] = [];
  return {
    id,
    pings: [] as number[],
    incoming: [] as unknown[],
    hasIncomingMessage() {
      return this.incoming.length > 0;
    },
    popMessage() {
      return this.incoming.shift();
    },
    drainPing() {
      const p = this.pings;
      this.pings = [];
      return p;
    },
    drainState() {
      return null;
    },
    drainFire() {
      return [];
    },
    drainSell() {
      return false;
    },
    drainRepair() {
      return false;
    },
    pushMessage(m: { serialize(): unknown[] }) {
      outgoing.push(m.serialize());
    },
    sendOutgoingMessages() {},
    outgoing,
  };
}

test('server answers a PING with a PONG echoing sentTime + server clock', () => {
  // Import lazily to avoid pulling the whole server graph at module load.
  const { NetworkServer } = require('../../server/src/net/network-server.ts');
  const conn = fakeConnection(1);
  conn.pings.push(555); // client sent-time awaiting a pong

  const world = { entities: new Map() } as any;
  const gameServer = { world, physics: {}, connectedClients: 0 } as any;
  const net = new NetworkServer(gameServer);
  net.connections = new Set([conn]);

  net.processIncoming(world, 8000); // server clock = 8000

  assert.equal(conn.outgoing.length, 1);
  assert.deepEqual(conn.outgoing[0], [Types.Messages.PONG, 555, 8000]);
});
```

> If `require` is not usable under the tsx/ESM harness, switch to a top-level `import { NetworkServer } from '../../server/src/net/network-server.ts';`. Prefer the static import; use it if `require` errors.

**Step 2: Run to verify it fails**

Run: `npm run test:sim`
Expected: FAIL — `conn.drainPing` referenced by `processIncoming` doesn't exist yet / no PONG pushed.

**Step 3: Write minimal implementation**

In `server/src/connection.ts`:

- Add a field near `fireQueue`:
  ```typescript
  // Clock-sync probes are events; each PING must be answered, so they queue.
  pingQueue: number[];
  ```
- Initialize in the constructor: `this.pingQueue = [];`
- Add a case in the message `switch`:
  ```typescript
  case Types.Messages.PING:
    this.pingQueue.push((data as number[])[0]);
    break;
  ```
- Add a drain method next to `drainFire`:
  ```typescript
  drainPing(): number[] {
    const pings = this.pingQueue;
    this.pingQueue = [];
    return pings;
  }
  ```

In `server/src/net/network-server.ts` `processIncoming(world, time)`, inside the per-connection loop (after the `HELLO` drain block, before/after the fire drain — order does not matter), add:

```typescript
// Answer clock-sync probes with the current server clock so the client can
// estimate latency + delta. `time` is this tick's performance.now().
for (const sentTime of connection.drainPing()) {
  connection.pushMessage(new Messages.Pong(sentTime, time));
}
```

Ensure `connection.sendOutgoingMessages()` is already reached for this connection in the normal flow (it is, via `broadcast()` at end of tick; if `processIncoming` should flush earlier for latency, leave as-is — the pong rides the same tick's outgoing flush).

**Step 4: Run to verify it passes**

Run: `npm run test:sim`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/connection.ts server/src/net/network-server.ts test/sim/ping-server.test.ts test/sim/index.ts
git commit -m "Reply to PING with PONG carrying the server clock"
```

(Remember to register `./ping-server.test.ts` in `test/sim/index.ts`.)

---

## Task 4: Client feeds PONG into TimeSyncManager + ping loop

**Files:**
- Modify: `client/src/connection.ts` (dispatch `PONG`, stamping `receiveTime` at socket receipt; extend `IncomingMessage` union)
- Modify: `client/src/net/network-client.ts` (own a `TimeSyncManager`; handle `PONG`; `sendPing()`; `serverNow()`/`isSynced()` accessors; `reset` on connect)
- Modify: `client/src/game.ts` (start a ~1 Hz ping loop; reset sync on (re)connect)

**Key accuracy point:** capture `receiveTime = performance.now()` in the socket `onmessage` handler for `PONG`, NOT at frame-drain time.

**Step 1: Write the failing test**

Time-sync feeding is already covered by Task 1. This task is wiring; assert the one piece of pure logic worth a test — that `NetworkClient` exposes a working `serverNow()` after a pong. Create `test/sim/network-client-sync.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { TimeSyncManager } from '../../shared/sim/net/time-sync.ts';
import { test } from './harness.ts';

// NetworkClient delegates to TimeSyncManager; constructing the full client pulls
// three/DOM, so this task's logic test stays at the manager boundary. The wiring
// itself (dispatch, ping loop) is verified by typecheck + manual run.
test('handling a pong updates the synced server clock', () => {
  const ts = new TimeSyncManager();
  // Simulate NetworkClient.onPong(sentTime, serverTime, receiveTime).
  ts.onTimeResponse(1000, 5100, 1200); // latency 100, delta = 5100-1200+100 = 4000
  assert.equal(ts.isSynced(), true);
  assert.equal(ts.getClockDelta(), 4000);
});
```

Register `./network-client-sync.test.ts` in `test/sim/index.ts`.

**Step 2: Run to verify it fails/passes**

Run: `npm run test:sim`
Expected: PASS immediately (it exercises only Task 1 code). This test documents the contract NetworkClient must honor; the real verification for this task is `npm run typecheck` after wiring.

**Step 3: Implement the wiring**

In `client/src/connection.ts`:

- Import stays as-is. Extend the `IncomingMessage` union with a `PONG` variant carrying the stamped receive time:
  ```typescript
  | {
      type: typeof Types.Messages.PONG;
      data: ReturnType<typeof Messages.Pong.deserialize> & { receiveTime: number };
    }
  ```
- Extend `MessageData` similarly if that helper union is still present.
- In `onmessage`, add a case that stamps receive time at true receipt:
  ```typescript
  case Types.Messages.PONG: {
    const pong = Messages.Pong.deserialize(data as number[]);
    data = { ...pong, receiveTime: performance.now() };
    break;
  }
  ```

In `client/src/net/network-client.ts`:

- Import: `import { TimeSyncManager } from '../../../shared/sim/net/time-sync.ts';`
- Add field + init in constructor:
  ```typescript
  timeSync: TimeSyncManager;
  // ...
  this.timeSync = new TimeSyncManager();
  ```
- In `processMessages()` `switch`, add:
  ```typescript
  case Types.Messages.PONG: {
    const { sentTime, serverTime, receiveTime } = message!.data;
    this.timeSync.onTimeResponse(sentTime, serverTime, receiveTime);
    break;
  }
  ```
- Add methods:
  ```typescript
  sendPing(): void {
    const socket = this.connection.getConnection();
    if (!socket || socket.readyState !== 1) {
      return;
    }
    this.connection.pushMessage(new Messages.Ping(performance.now()));
    this.connection.sendOutgoingMessages();
  }

  // Called on (re)connect: a new server process has an unrelated clock origin.
  resetSync(): void {
    this.timeSync.reset();
  }

  serverNow(): number {
    return this.timeSync.serverNow();
  }

  isSynced(): boolean {
    return this.timeSync.isSynced();
  }
  ```

In `client/src/game.ts`:

- In the constructor's connection callbacks, reset sync on connect:
  ```typescript
  this.connection.onConnection(() => {
    console.log('Connected to server');
    this.networkClient.resetSync();
  });
  ```
- In `init()` (after `requestAnimationFrame(...)` is set up, or right before), start the ping loop:
  ```typescript
  // ~1 Hz clock-sync probe; TimeSyncManager tracks drift from the rolling window.
  setInterval(() => this.networkClient.sendPing(), 1000);
  ```

**Step 4: Verify**

Run: `npm run test:sim` (PASS) and `npm run typecheck` (no errors).
Expected: both clean.

**Step 5: Commit**

```bash
git add client/src/connection.ts client/src/net/network-client.ts client/src/game.ts test/sim/network-client-sync.test.ts test/sim/index.ts
git commit -m "Feed PONG into TimeSyncManager; run a 1Hz client ping loop"
```

---

## Task 5: Stamp WORLD snapshots with the server clock

**Files:**
- Modify: `shared/messages.ts` (`World` gains `serverTime`)
- Modify: `server/src/net/network-server.ts` (`broadcast` passes `time`)
- Modify: `client/src/connection.ts` (WORLD dispatch + union type)
- Modify: `client/src/net/network-client.ts` (`applyWorldState` reads `serverTime` + `entities`)
- Test: `test/sim/messages.test.ts` (append)

**Step 1: Write the failing test**

Append to `test/sim/messages.test.ts`:

```typescript
test('World carries a serverTime prefix before the entity run', () => {
  const entities = [{ id: 42, state: [1, 2, 3, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] }];
  const wire = new Messages.World(entities, 7777).serialize();
  assert.equal(wire[0], Types.Messages.WORLD);
  assert.equal(wire[1], 7777); // serverTime
  assert.equal(wire[2], 42); // first entity id

  const decoded = Messages.World.deserialize(wire.slice(1) as number[]);
  assert.equal(decoded.serverTime, 7777);
  assert.equal(decoded.entities.length, 1);
  assert.equal(decoded.entities[0].id, 42);
});
```

> This changes the existing `World.deserialize` return shape from an array to `{ serverTime, entities }`. Update any existing World test in this file that asserts the old array shape.

**Step 2: Run to verify it fails**

Run: `npm run test:sim`
Expected: FAIL — `World` constructor takes one arg / `deserialize` returns an array.

**Step 3: Implement**

In `shared/messages.ts`, replace the `World` class:

```typescript
class World {
  entities: WorldStateEntry[];
  serverTime: number;

  constructor(entities: WorldStateEntry[], serverTime: number) {
    this.entities = entities;
    this.serverTime = serverTime;
  }

  static deserialize(message: number[]) {
    const serverTime = message[0];
    const entities: {
      id: number;
      position: Vector3;
      rotation: Quaternion;
      velocity: Vector3;
      angularVelocity: Vector3;
      input: number;
      health: number;
    }[] = [];

    // After the serverTime prefix: 16 numbers per entity (id + 15 state values).
    for (let i = 1; i < message.length; i += 16) {
      entities.push({
        id: message[i],
        position: new Vector3(message[i + 1], message[i + 2], message[i + 3]),
        rotation: new Quaternion(
          message[i + 4],
          message[i + 5],
          message[i + 6],
          message[i + 7],
        ),
        velocity: new Vector3(message[i + 8], message[i + 9], message[i + 10]),
        angularVelocity: new Vector3(
          message[i + 11],
          message[i + 12],
          message[i + 13],
        ),
        input: message[i + 14],
        health: message[i + 15],
      });
    }

    return { serverTime, entities };
  }

  serialize() {
    const data: number[] = [Types.Messages.WORLD, this.serverTime];
    for (const { id, state } of this.entities) {
      data.push(id, ...state);
    }
    return data;
  }
}
```

In `server/src/net/network-server.ts` `broadcast(world, time)` — the two `new Messages.World(relevant)` call sites become `new Messages.World(relevant, time)`. (`broadcast` currently ignores `time` via `_time`; rename the param to `time` and use it.)

In `client/src/connection.ts`:
- WORLD union variant `data` type becomes `ReturnType<typeof Messages.World.deserialize>` (now the object) — no change needed if it already references that ReturnType; it will pick up the new shape automatically.
- The `onmessage` WORLD case stays `data = Messages.World.deserialize(data as number[]);` (unchanged).

In `client/src/net/network-client.ts` `applyWorldState`:
- Change the signature/consumption to read the new shape. Where `processMessages` calls `this.applyWorldState(message!.data)`, that `data` is now `{ serverTime, entities }`. Update `applyWorldState` to destructure:
  ```typescript
  applyWorldState(
    snapshot: ReturnType<typeof Messages.World.deserialize>,
  ): void {
    const { entities } = snapshot;
    for (const { id, position, rotation, velocity, angularVelocity, input, health } of entities) {
      // ... unchanged body for now (extrapolation added in Task 7) ...
    }
  }
  ```
  (Task 7 will use `snapshot.serverTime`.)

**Step 4: Verify**

Run: `npm run test:sim` (PASS) and `npm run typecheck` (clean).

**Step 5: Commit**

```bash
git add shared/messages.ts server/src/net/network-server.ts client/src/connection.ts client/src/net/network-client.ts test/sim/messages.test.ts
git commit -m "Stamp WORLD snapshots with the server clock"
```

---

## Task 6: Extrapolation math (pure helpers)

**Files:**
- Create: `shared/sim/net/extrapolate.ts`
- Test: `test/sim/extrapolate.test.ts`
- Modify: `test/sim/index.ts`

**Step 1: Write the failing test**

Create `test/sim/extrapolate.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import {
  snapshotAge,
  extrapolatePosition,
  extrapolateRotation,
  MAX_EXTRAP_MS,
} from '../../shared/sim/net/extrapolate.ts';
import { test } from './harness.ts';

test('snapshotAge is serverNow - serverTime when synced', () => {
  assert.equal(snapshotAge(1100, 1000, true), 100);
});

test('snapshotAge is 0 before the clock is synced', () => {
  assert.equal(snapshotAge(9999, 1000, false), 0);
});

test('snapshotAge never goes negative', () => {
  assert.equal(snapshotAge(900, 1000, true), 0);
});

test('snapshotAge clamps to the extrapolation ceiling', () => {
  assert.equal(snapshotAge(1000 + MAX_EXTRAP_MS + 500, 1000, true), MAX_EXTRAP_MS);
});

test('extrapolatePosition advances by worldVel * ageSeconds', () => {
  const out = new Vector3();
  const pos = new Vector3(0, 0, 0);
  const vel = new Vector3(10, 0, 0); // units/sec, world-space
  extrapolatePosition(out, pos, vel, 200); // 0.2s -> +2 on x
  assert.ok(Math.abs(out.x - 2) < 1e-9);
  assert.equal(out.y, 0);
  assert.equal(out.z, 0);
});

test('extrapolatePosition is a no-op at age 0', () => {
  const out = new Vector3();
  extrapolatePosition(out, new Vector3(5, 6, 7), new Vector3(9, 9, 9), 0);
  assert.deepEqual([out.x, out.y, out.z], [5, 6, 7]);
});

test('extrapolateRotation is identity at age 0', () => {
  const out = new Quaternion();
  const r = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
  extrapolateRotation(out, r, new Vector3(0, 0, 0), 0);
  assert.ok(Math.abs(out.x - r.x) < 1e-9);
  assert.ok(Math.abs(out.w - r.w) < 1e-9);
});

test('extrapolateRotation advances about the angular-velocity axis', () => {
  const out = new Quaternion();
  const start = new Quaternion(); // identity
  const angVel = new Vector3(0, 1, 0); // 1 rad/s about +y
  extrapolateRotation(out, start, angVel, 500); // 0.5s -> 0.5 rad about y
  const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
  assert.ok(Math.abs(out.y - expected.y) < 1e-6);
  assert.ok(Math.abs(out.w - expected.w) < 1e-6);
});
```

Register `./extrapolate.test.ts` in `test/sim/index.ts`.

**Step 2: Run to verify it fails**

Run: `npm run test:sim`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `shared/sim/net/extrapolate.ts`:

```typescript
import { Vector3, Quaternion } from 'three';

// Never extrapolate a remote entity more than this far past its snapshot: a GC
// pause, a backgrounded tab, or a wildly wrong early clock delta could otherwise
// fling it across the map.
export const MAX_EXTRAP_MS = 250;

// How far (ms) a snapshot's server time lags the current synced server clock.
// Floored at 0 (never rewind) and clamped to MAX_EXTRAP_MS. Returns 0 while the
// clock is unsynced so callers fall back to a raw snap.
export function snapshotAge(
  serverNow: number,
  serverTime: number,
  synced: boolean,
): number {
  if (!synced) return 0;
  const age = serverNow - serverTime;
  if (age <= 0) return 0;
  return age > MAX_EXTRAP_MS ? MAX_EXTRAP_MS : age;
}

// out = position + worldVelocity * (ageMs / 1000). `worldVelocity` must already
// be in world space (see resolveWorldVelocity in network-client).
export function extrapolatePosition(
  out: Vector3,
  position: Vector3,
  worldVelocity: Vector3,
  ageMs: number,
): Vector3 {
  return out.copy(position).addScaledVector(worldVelocity, ageMs / 1000);
}

// out = rotation advanced by angularVelocity (world-space rad/s) over ageMs. The
// delta quaternion is premultiplied (world-space angular velocity).
const _axis = new Vector3();
const _delta = new Quaternion();
export function extrapolateRotation(
  out: Quaternion,
  rotation: Quaternion,
  angularVelocity: Vector3,
  ageMs: number,
): Quaternion {
  const dt = ageMs / 1000;
  const speed = angularVelocity.length();
  if (speed < 1e-9 || dt === 0) {
    return out.copy(rotation);
  }
  _axis.copy(angularVelocity).divideScalar(speed);
  _delta.setFromAxisAngle(_axis, speed * dt);
  return out.copy(_delta).multiply(rotation);
}
```

**Step 4: Run to verify it passes**

Run: `npm run test:sim`
Expected: PASS.

**Step 5: Commit**

```bash
git add shared/sim/net/extrapolate.ts test/sim/extrapolate.test.ts test/sim/index.ts
git commit -m "Add pure snapshot-age + pose extrapolation helpers"
```

---

## Task 7: Apply extrapolation in applyWorldState

**Files:**
- Modify: `client/src/net/network-client.ts` (`applyWorldState`)
- Test: `test/sim/apply-extrapolation.test.ts` (drive with a fake SimBody + minimal world)

**Approach:** Compute `age = snapshotAge(this.serverNow(), snapshot.serverTime, this.isSynced())` once. Resolve each entity's world velocity, then feed the extrapolated pose into the existing three branches (body / vendor / no-body mirror). A one-time receipt jump for bodies composes with the Rapier coast, so no per-frame code changes.

**Step 1: Write the failing test**

The full `NetworkClient` pulls `three`, `Connection`, camera, settings. To keep the test at the logic boundary, extract velocity resolution + pose extrapolation into a small pure method `extrapolatedPose(entity, position, rotation, velocity, angularVelocity, age)` on `NetworkClient` that returns `{ position, rotation }`, and test that method against a lightweight instance. Construct `NetworkClient` with stub collaborators:

```typescript
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import Types from '../../shared/types.ts';
import { NetworkClient } from '../../client/src/net/network-client.ts';
import { test } from './harness.ts';

function stubClient() {
  // Only the fields extrapolatedPose touches are needed.
  return new NetworkClient(
    { getConnection: () => null } as any, // connection
    { get: () => undefined, entities: new Map() } as any, // world
    {} as any, // camera
    {} as any, // settings
  );
}

test('ship pose extrapolates position by world velocity and rotation by angvel', () => {
  const c = stubClient();
  const pose = c.extrapolatedPose(
    { type: Types.Entities.SPACESHIP, body: {} } as any,
    new Vector3(0, 0, 0),
    new Quaternion(),
    new Vector3(10, 0, 0), // world-space linvel
    new Vector3(0, 0, 0),
    200, // ms
  );
  assert.ok(Math.abs(pose.position.x - 2) < 1e-9);
});

test('bullet velocity is treated as local +z and rotated into world space', () => {
  const c = stubClient();
  // Rotate 90deg about +y so local +z maps to world +x.
  const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const pose = c.extrapolatedPose(
    { type: Types.Entities.BULLET, body: null } as any,
    new Vector3(0, 0, 0),
    rot,
    new Vector3(0, 0, 100), // local forward speed
    new Vector3(0, 0, 0),
    100, // 0.1s -> 10 units along world +x
  );
  assert.ok(Math.abs(pose.position.x - 10) < 1e-6);
  assert.ok(Math.abs(pose.position.z) < 1e-6);
});

test('age 0 (unsynced) yields the raw pose', () => {
  const c = stubClient();
  const pose = c.extrapolatedPose(
    { type: Types.Entities.SPACESHIP, body: {} } as any,
    new Vector3(3, 4, 5),
    new Quaternion(),
    new Vector3(99, 99, 99),
    new Vector3(0, 0, 0),
    0,
  );
  assert.deepEqual([pose.position.x, pose.position.y, pose.position.z], [3, 4, 5]);
});
```

Register `./apply-extrapolation.test.ts` in `test/sim/index.ts`.

**Step 2: Run to verify it fails**

Run: `npm run test:sim`
Expected: FAIL — `extrapolatedPose` is not a function (and possibly a construction error if stubs are insufficient; adjust stubs minimally until only the missing method fails).

**Step 3: Implement**

In `client/src/net/network-client.ts`:

- Import helpers + reuse scratch objects:
  ```typescript
  import { snapshotAge, extrapolatePosition, extrapolateRotation } from '../../../shared/sim/net/extrapolate.ts';
  ```
- Add scratch fields (avoid per-entity allocation): `_extrapPos = new Vector3();` `_extrapRot = new Quaternion();` `_worldVel = new Vector3();`
- Add the method:
  ```typescript
  // Resolve the entity's velocity to world space, then advance pose by `age`.
  // Bullets store local +z forward velocity and carry no body; everything with a
  // physics body reports world-space linvel already.
  extrapolatedPose(
    entity: Entity,
    position: Vector3,
    rotation: Quaternion,
    velocity: Vector3,
    angularVelocity: Vector3,
    age: number,
  ): { position: Vector3; rotation: Quaternion } {
    if (entity.type === Types.Entities.BULLET) {
      this._worldVel.copy(velocity).applyQuaternion(rotation);
    } else {
      this._worldVel.copy(velocity);
    }
    extrapolatePosition(this._extrapPos, position, this._worldVel, age);
    extrapolateRotation(this._extrapRot, rotation, angularVelocity, age);
    return { position: this._extrapPos, rotation: this._extrapRot };
  }
  ```
- In `applyWorldState(snapshot)`, compute age once and route each branch through the extrapolated pose:
  ```typescript
  const age = snapshotAge(this.serverNow(), snapshot.serverTime, this.isSynced());
  for (const { id, position, rotation, velocity, angularVelocity, input, health } of snapshot.entities) {
    if (id === this.localPlayerId) continue;
    const entity = this.world.get(id);
    if (!entity) { console.error(`Entity ${id} doesn't exist on client`); continue; }

    // health + renderInput handling: UNCHANGED (keep existing code).

    const pose = this.extrapolatedPose(entity, position, rotation, velocity, angularVelocity, age);

    if (entity.type === Types.Entities.VENDOR) {
      entity.transform.position.copy(pose.position);
      entity.transform.rotation.copy(pose.rotation);
      entity.velocity.copy(velocity);
      continue;
    }

    const body = entity.body as unknown as SimBody | null;
    if (body) {
      body.setTranslation(pose.position, true);
      body.setRotation(pose.rotation, true);
      body.setLinvel(velocity, true);
      body.setAngvel(angularVelocity, true);
      entity.transform.position.copy(pose.position);
      entity.transform.rotation.copy(pose.rotation);
    } else {
      const transform = entity.transform;
      transform.prevPosition = transform.position.clone();
      transform.prevRotation = transform.rotation.clone();
      transform.position.copy(pose.position);
      transform.rotation.copy(pose.rotation);
    }
  }
  ```
  > Preserve the existing health mirroring and `renderInput` decode exactly where they are today — only the pose source changes from raw `position/rotation` to `pose.position/pose.rotation`.

**Step 4: Verify**

Run: `npm run test:sim` (PASS) and `npm run typecheck` (clean).

**Step 5: Commit**

```bash
git add client/src/net/network-client.ts test/sim/apply-extrapolation.test.ts test/sim/index.ts
git commit -m "Extrapolate remote entity poses by synced snapshot age"
```

---

## Task 8: Full verification

**Files:** none (verification only)

**Step 1: Run the full sim suite**

Run: `npm run test:sim`
Expected: all prior 135 tests + the new time-sync/message/extrapolation tests PASS, 0 failed.

**Step 2: Typecheck both projects**

Run: `npm run typecheck`
Expected: clean (root + client tsconfig).

**Step 3: Lint**

Run: `npm run lint`
Expected: clean (or auto-fixable; `npm run lint-and-fix` then re-commit if biome reformats).

**Step 4: Manual end-to-end (USER-DRIVEN — do NOT start dev servers)**

Ask the user to exercise their already-running client/server (or to start them himself). Verify:
- Two clients see each other's ships tracking smoothly, landing closer to real position at speed (less "behind" feel) than before.
- No teleporting/overshoot on sharp turns beyond a brief, bounded correction.
- Fast remote bullets read as on-target.

Report observations; do not launch anything.

**Step 5: Final commit (if lint reformatted anything)**

```bash
git add -A && git commit -m "Lint/format pass for time-sync extrapolation"
```

---

## Notes & risks

- **Composition correctness (ships):** receipt-time jump `worldVel·age` + per-tick Rapier coast from receipt = continuous extrapolation to `serverNow()`. Do not also extrapolate per-frame — that double-counts.
- **Render lerp on first synced snapshot:** the age jump is a small (~half-RTT), roughly constant offset applied once, then coasted — smooth at 60 Hz snapshot cadence. If a visible pop appears on the very first synced snapshot, it is one-frame and acceptable; revisit only if reported.
- **Remote bullets freeze between snapshots** (no per-frame integration for no-body mirrors) — unchanged from today; the age jump still improves placement. Out of scope to add bullet smoothing.
- **Clock warm-up:** until the first PONG, `age = 0` → today's raw-snap behavior. The 1 Hz loop reaches a filtered delta within a few seconds; the first sample is used immediately so it is roughly right at once.
```