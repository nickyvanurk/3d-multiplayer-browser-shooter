import { generateName } from '../../shared/names/generate-name.ts';

// The local player's callsign. Generated once as a random adjective+noun (the
// same shape bots use) and persisted to localStorage so it stays stable across
// reloads, instead of every client sharing one hardcoded default name.
const NAME_KEY = 'voidfall.playerName';

// Returns this browser's stable callsign, minting and storing one on first use.
// Robust to localStorage being unavailable (private mode / quota / blocked):
// there it simply returns a fresh name each load rather than throwing.
export function getPlayerName(): string {
  try {
    const stored = localStorage.getItem(NAME_KEY);
    if (stored) {
      return stored;
    }
    const name = generateName();
    localStorage.setItem(NAME_KEY, name);
    return name;
  } catch {
    return generateName();
  }
}
