// Kill-driven XP progression. Pure functions so the server (authoritative) and the
// tests share one source of truth; the client is fed the results over the wire and
// never runs these.
//
// Tuning (browser game, ~30-min sessions, reset-on-death):
//   xpForNextLevel(L) = 10 * L^2      cost to go from level L to L+1
//   killXp(v)         = 10 * v        reward for killing a level-v ship
// Against an equal-level opponent this is exactly "1 kill -> L2, 2 -> L3, 3 -> L4"
// (kills-per-level == your level); against level-1 bots it is L^2 kills, so
// out-levelling the bots pushes you to hunt bigger ships. No level cap.

// The minimal shape awardKill mutates — Ship satisfies it, and tests can pass a
// bare object.
export interface Progressable {
  level: number;
  xp: number;
}

export function xpForNextLevel(level: number): number {
  return 10 * level * level;
}

export function killXp(victimLevel: number): number {
  return 10 * victimLevel;
}

// XP granted per ore chunk picked up (ORE_PER_CHUNK = 1 cargo). A flat reward, so
// mining is a steady early-game XP path that naturally fades once levels cost L².
export const XP_PER_ORE = 1;

// Add XP to a pilot and consume it into as many levels as it buys, carrying the
// remainder. A single large reward can grant several levels at once.
export function awardXp(target: Progressable, amount: number): void {
  target.xp += amount;
  while (target.xp >= xpForNextLevel(target.level)) {
    target.xp -= xpForNextLevel(target.level);
    target.level += 1;
  }
}

// Award a kill's XP to the killer (scaled by the victim's level).
export function awardKill(killer: Progressable, victimLevel: number): void {
  awardXp(killer, killXp(victimLevel));
}
