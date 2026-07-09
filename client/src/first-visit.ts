// Tracks whether this browser has ever loaded the game, independent of any
// game settings the player may or may not have changed. Persisted to
// localStorage under its own key so the signal is stable across reloads.

const VISITED_KEY = 'voidfall.visited';

// Returns true only on the very first load for this browser, and atomically
// marks the browser as visited so every later load returns false. Robust to
// localStorage being unavailable (private mode / quota / blocked): there the
// flag can never be stored, so we always report a first visit rather than
// throwing.
export function consumeFirstVisit(): boolean {
  try {
    if (localStorage.getItem(VISITED_KEY) !== null) {
      return false;
    }
    localStorage.setItem(VISITED_KEY, '1');
    return true;
  } catch {
    return true;
  }
}
