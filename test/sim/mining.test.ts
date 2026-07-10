import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  ORE_STEP,
  ASTEROID_MIN_SCALE,
  asteroidMaxOre,
  asteroidScale,
  chunksDropped,
  chunksForRange,
  chunkSpawnPosition,
} from '../../shared/sim/mining.ts';
import { test } from './harness.ts';

test('asteroidMaxOre scales with size and never drops below one chunk', () => {
  assert.ok(asteroidMaxOre(120) > asteroidMaxOre(10));
  assert.ok(asteroidMaxOre(1) >= ORE_STEP);
});

test('chunksDropped counts whole ORE_STEP thresholds mined so far', () => {
  const max = ORE_STEP * 5;
  assert.equal(chunksDropped(max, max), 0); // full → nothing mined
  assert.equal(chunksDropped(max, max - ORE_STEP), 1);
  assert.equal(chunksDropped(max, max - ORE_STEP * 2), 2);
  assert.equal(chunksDropped(max, 0), 5);
});

test('a single mining step yields exactly one fresh chunk', () => {
  const max = ORE_STEP * 5;
  assert.equal(chunksForRange(max, max, max - ORE_STEP), 1);
});

test('a coalesced range yields the SAME count as summing the sub-steps', () => {
  const max = ORE_STEP * 5;
  const a = max;
  const b = max - ORE_STEP;
  const c = max - ORE_STEP * 2;
  const d = max - ORE_STEP * 3;
  const jumped = chunksForRange(max, a, d); // one jump across three thresholds
  const stepped =
    chunksForRange(max, a, b) +
    chunksForRange(max, b, c) +
    chunksForRange(max, c, d);
  assert.equal(jumped, stepped);
  assert.equal(jumped, 3);
});

test('no chunks when ore did not cross a fresh threshold', () => {
  const max = ORE_STEP * 5;
  // A dent smaller than one full ORE_STEP → no chunk yet.
  assert.equal(chunksForRange(max, max, max - (ORE_STEP - 1)), 0);
});

test('asteroidScale shrinks from base at full ore to the shared floor at empty', () => {
  const base = 60;
  const max = 100;
  assert.equal(asteroidScale(base, max, max), base); // full → full size
  assert.equal(asteroidScale(base, 0, max), ASTEROID_MIN_SCALE); // empty → husk
  const half = asteroidScale(base, max / 2, max);
  assert.ok(half > ASTEROID_MIN_SCALE && half < base); // monotone between
  assert.equal(asteroidScale(base, max * 2, max), base); // clamps over-full ore
});

test('all asteroids shrink to the SAME small size regardless of base scale', () => {
  const max = 100;
  assert.equal(asteroidScale(10, 0, max), ASTEROID_MIN_SCALE);
  assert.equal(asteroidScale(120, 0, max), ASTEROID_MIN_SCALE);
  // ...so a bigger rock travels a far larger range as it depletes.
  const bigRange = 120 - asteroidScale(120, 0, max);
  const smallRange = 10 - asteroidScale(10, 0, max);
  assert.ok(bigRange > smallRange);
});

test('chunkSpawnPosition is deterministic for a given chunk id', () => {
  const center = new Vector3(0, 0, 0);
  const impact = new Vector3(100, 50, -20);
  assert.deepEqual(
    chunkSpawnPosition(impact, center, 7).toArray(),
    chunkSpawnPosition(impact, center, 7).toArray(),
  );
});

test('chunkSpawnPosition never lands inside the rock (always past the surface)', () => {
  const center = new Vector3(0, 0, 0);
  const impact = new Vector3(20, 0, 0); // a surface point 20 out from centre
  const surfaceDist = impact.distanceTo(center);
  for (let id = 1; id < 60; id++) {
    const p = chunkSpawnPosition(impact, center, id);
    assert.ok(
      p.distanceTo(center) >= surfaceDist,
      `chunk ${id} spawned inside the rock`,
    );
  }
});

test('different chunk ids spawn at different points', () => {
  const center = new Vector3(0, 0, 0);
  const impact = new Vector3(30, 0, 0);
  assert.notDeepEqual(
    chunkSpawnPosition(impact, center, 1).toArray(),
    chunkSpawnPosition(impact, center, 2).toArray(),
  );
});
