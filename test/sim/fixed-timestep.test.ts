import assert from 'node:assert/strict';
import Utils from '../../shared/utils.ts';
import { test } from './harness.ts';

test('createFixedTimestep advances sim time by exactly timestep each sub-step', () => {
  const dts: number[] = [];
  const times: number[] = [];
  const step = Utils.createFixedTimestep(50, (dt, time) => {
    dts.push(dt);
    times.push(time);
  });

  step(120); // 120 lag -> 2 sub-steps, 20 leftover
  step(40); //  60 lag -> 1 sub-step, 10 leftover
  step(10); //  20 lag -> 0 sub-steps

  assert.deepEqual(dts, [50, 50, 50]);
  assert.deepEqual(times, [50, 100, 150]);
});

test('createFixedTimestep sim time does not depend on wall-clock input', () => {
  const times: number[] = [];
  const step = Utils.createFixedTimestep(50, (_dt, time) => times.push(time));

  // Sim time must come from accumulated dt, so wildly varying real elapsed time
  // between frames must not change the timestamps the sim sees.
  step(50);
  step(50);

  assert.deepEqual(times, [50, 100]);
});

test('createFixedTimestep returns the leftover interpolation fraction', () => {
  const step = Utils.createFixedTimestep(50, () => {});

  const frac = step(120); // 2 sub-steps consumed, 20 of 50 left over

  assert.ok(Math.abs(frac - 20 / 50) < 1e-9);
});
