import { ADJECTIVES, NOUNS } from './words.ts';

// Canonical name shape (ported from ~/dev/vehicle): 3–12 ASCII letters. Not
// every adjective+noun pair fits, so generateName retries.
export const NAME_REGEX = /^[A-Za-z]{3,12}$/;

// A random adjective+noun callsign, e.g. "FastWolf". `rng` defaults to
// Math.random; bots pass their seeded RNG so their names stay deterministic.
export function generateName(rng: () => number = Math.random): string {
  for (let i = 0; i < 100; i++) {
    const adjective = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)];
    const candidate = `${adjective}${noun}`;
    if (NAME_REGEX.test(candidate)) {
      return candidate;
    }
  }
  // Exhausting the retry loop is astronomically unlikely; fall back to a pair
  // that is known to fit rather than throw and kill a spawn.
  return 'LoneFox';
}
