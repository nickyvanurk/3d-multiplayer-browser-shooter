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

test('a steady shift beyond hysteresis is adopted as the new delta', () => {
  const ts = new TimeSyncManager();
  // First sample establishes delta 1000 (latency 50).
  ts.onTimeResponse(0, 1050, 100);
  assert.equal(ts.getClockDelta(), 1000);
  // Six STEADY, equal-latency (50) samples implying a new delta of 1200 -> far
  // beyond the 25ms hysteresis. Equal latencies make stdDev 0, so the `<=` filter
  // keeps EVERY sample (a strict `<` would keep none, freeze the delta at 1000,
  // and fail this test). Six samples overfill the window (WINDOW=6), fully
  // replacing the initial 1000-delta sample, so the filtered delta converges to
  // exactly 1200 and the hysteresis branch adopts it.
  for (let i = 1; i <= 6; i++) {
    const sent = i * 1000;
    const recv = sent + 100; // latency 50
    ts.onTimeResponse(sent, recv + 1150, recv); // delta = 1150 + 50 = 1200
  }
  assert.ok(
    Math.abs(ts.getClockDelta() - 1200) < 1e-9,
    `expected delta to be adopted to ~1200, got ${ts.getClockDelta()}`,
  );
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
