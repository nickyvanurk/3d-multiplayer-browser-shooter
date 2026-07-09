// Pilot behaviour, modelled on FreeSpace 2's open-source combat AI (aicode.cpp).
// A bot only fills in CONTROL INPUTS (turn + throttle + fire) — the ship's real
// physics integrates them, so bots fly with the exact speed, turn rate, momentum
// and damping of a player ship. This struct therefore holds only *behaviour*
// (when to fight, how accurate, how brave), never movement physics.
//
// A bot mostly CRUISES/explores, commits to a fight when an enemy comes close,
// and flees when hurt. Archetypes differ in style (brawler/sniper/ace/balanced).
// Angles in degrees, distances in world units, times in milliseconds.
export interface BotProfile {
  name: string;

  // Sensing — no omniscience; a front acquisition cone is flankable.
  detectionRange: number;
  acquireFovDeg: number;
  engageRange: number; // commit to a fight only when an enemy is this close
  reactionMs: number; // human beat before reacting to a newly-noticed enemy

  // Engage geometry (units).
  fireRange: number; // open fire within this range
  breakOffRange: number; // break off before ramming/overshooting
  boostRange: number; // afterburner to close while farther than this

  // Accuracy — FS2's model (set_predicted_enemy_pos): aim at the predicted
  // intercept plus a WORLD-SPACE random offset of magnitude (1-accuracy)*BASE,
  // multiplied up before the aim settles (convergence) and shrinking to 1x once
  // the nose holds on the target. Range-independent, so it threatens at range.
  accuracy: number; // 0..1; higher = smaller miss
  convergenceMs: number; // held-aim time to fully converge
  inRangeTimeMs: number; // nose-on-target time before opening fire
  fireConeDeg: number; // half-angle within which it shoots

  // Behaviour (FreeSpace courage/patience/evasion).
  aggression: number; // 0..1 boost appetite, closes shorter, holds offense longer
  patienceMs: number; // stalemate time before breaking off a pass
  evasiveness: number; // 0..1 jink amplitude / how long it stays defensive
  retreatHealth: number; // flee below this health
  breakMs: number; // break-off / reposition duration
  repositionMs: number; // gain-separation duration before re-attacking
}

// Bullet world speed, units/second (sweepProjectiles: velocity 1.5 * dt_ms).
export const BULLET_SPEED = 1.5 * 1000;

// World-space miss magnitude (units) per (1-accuracy) when converged; ×up to 5
// before the aim settles. Sized against the ~7.5u ship half-width so a converged
// MEDIUM bot (accuracy ~0.5 → ~6u miss) lands ~40% up close but sprays before it
// locks — threatening but beatable for kids.
export const AIM_MISS_BASE = 12;

// The ship flies at its real physics (≈50 u/s, 100 boosted, ~73 deg/s turn), so
// fights happen close (~100-250u) and cruising ranges wider. Only behaviour is
// tuned here.

// In-your-face: closes to knife-fight range, relentless once committed.
export const BRAWLER: BotProfile = {
  name: 'brawler',
  detectionRange: 800,
  acquireFovDeg: 160,
  engageRange: 360,
  reactionMs: 300,
  fireRange: 240,
  breakOffRange: 50,
  boostRange: 260,
  accuracy: 0.55,
  convergenceMs: 650,
  inRangeTimeMs: 0,
  fireConeDeg: 45,
  aggression: 0.85,
  patienceMs: 3200,
  evasiveness: 0.35,
  retreatHealth: 20,
  breakMs: 700,
  repositionMs: 800,
};

// Holds range, precise, keeps its distance and picks shots.
export const SNIPER: BotProfile = {
  name: 'sniper',
  detectionRange: 1000,
  acquireFovDeg: 120,
  engageRange: 560,
  reactionMs: 550,
  fireRange: 430,
  breakOffRange: 170,
  boostRange: 420,
  accuracy: 0.68,
  convergenceMs: 900,
  inRangeTimeMs: 120,
  fireConeDeg: 32,
  aggression: 0.4,
  patienceMs: 4200,
  evasiveness: 0.5,
  retreatHealth: 40,
  breakMs: 800,
  repositionMs: 1300,
};

// Evasive, sticks on the tail, hard to shake.
export const ACE: BotProfile = {
  name: 'ace',
  detectionRange: 900,
  acquireFovDeg: 150,
  engageRange: 400,
  reactionMs: 350,
  fireRange: 260,
  breakOffRange: 65,
  boostRange: 300,
  accuracy: 0.55,
  convergenceMs: 750,
  inRangeTimeMs: 0,
  fireConeDeg: 42,
  aggression: 0.6,
  patienceMs: 4500,
  evasiveness: 0.65,
  retreatHealth: 28,
  breakMs: 750,
  repositionMs: 1000,
};

// The all-rounder; also the default for tests.
export const BALANCED: BotProfile = {
  name: 'balanced',
  detectionRange: 900,
  acquireFovDeg: 150,
  engageRange: 400,
  reactionMs: 400,
  fireRange: 280,
  breakOffRange: 60,
  boostRange: 300,
  accuracy: 0.5,
  convergenceMs: 700,
  inRangeTimeMs: 0,
  fireConeDeg: 42,
  aggression: 0.6,
  patienceMs: 3400,
  evasiveness: 0.45,
  retreatHealth: 30,
  breakMs: 750,
  repositionMs: 1000,
};

export const MEDIUM = BALANCED;
export const ARCHETYPES: BotProfile[] = [BRAWLER, SNIPER, ACE, BALANCED];

const JITTER_FIELDS: (keyof BotProfile)[] = [
  'engageRange',
  'reactionMs',
  'fireRange',
  'boostRange',
  'accuracy',
  'aggression',
  'patienceMs',
  'evasiveness',
  'repositionMs',
];

// Pick a random archetype and jitter it into a unique pilot.
export function pickProfile(rng: () => number): BotProfile {
  const base = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const out = { ...base };
  for (const f of JITTER_FIELDS) {
    (out[f] as number) = (base[f] as number) * (0.85 + rng() * 0.3);
  }
  return out;
}
