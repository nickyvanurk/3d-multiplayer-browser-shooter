import assert from 'node:assert/strict';
import {
  xpForNextLevel,
  killXp,
  awardKill,
} from '../../shared/sim/progression.ts';
import { test } from './harness.ts';

test('xpForNextLevel follows 10*level^2', () => {
  assert.equal(xpForNextLevel(1), 10);
  assert.equal(xpForNextLevel(2), 40);
  assert.equal(xpForNextLevel(3), 90);
  assert.equal(xpForNextLevel(4), 160);
});

test('killXp scales linearly with the victim level', () => {
  assert.equal(killXp(1), 10);
  assert.equal(killXp(2), 20);
  assert.equal(killXp(5), 50);
});

test('one same-level kill takes a level-1 pilot to level 2', () => {
  const p = { level: 1, xp: 0 };
  awardKill(p, 1);
  assert.equal(p.level, 2);
  assert.equal(p.xp, 0);
});

test('leftover XP carries into the next level', () => {
  // Level 2 needs 40 to reach 3. A level-3 victim is worth 30 -> still level 2
  // with 30 banked; a second level-1 (10) tips it to exactly 40 -> level 3, 0 xp.
  const p = { level: 2, xp: 0 };
  awardKill(p, 3);
  assert.equal(p.level, 2);
  assert.equal(p.xp, 30);
  awardKill(p, 1);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 0);
});

test('a single fat kill can grant multiple levels', () => {
  // From level 1: reaching level 3 costs 10 (1->2) + 40 (2->3) = 50 cumulative.
  // A level-5 victim is worth 50 -> jumps straight to level 3 with 0 left over.
  const p = { level: 1, xp: 0 };
  awardKill(p, 5);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 0);
});

test('killing weaker targets takes L^2 kills of a level-1 victim', () => {
  // At level 2 -> 3 needs 40 xp; a level-1 kill is 10, so four are required.
  const p = { level: 2, xp: 0 };
  awardKill(p, 1);
  awardKill(p, 1);
  awardKill(p, 1);
  assert.equal(p.level, 2);
  awardKill(p, 1);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 0);
});
