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
