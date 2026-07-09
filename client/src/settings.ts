// User-tunable settings, persisted to localStorage so they survive reloads.
// FOV is stored as horizontal degrees (game convention); the renderer converts
// to the vertical FOV three.js expects based on the current aspect ratio.

const STORAGE_KEY = 'voidfall.settings';

export const FOV_LIMITS = { min: 60, max: 120 } as const;

export interface GameSettings {
  horizontalFov: number;
}

const DEFAULTS: GameSettings = {
  horizontalFov: 90,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export class SettingsStore {
  private settings: GameSettings;

  constructor() {
    this.settings = this.load();
  }

  get horizontalFov(): number {
    return this.settings.horizontalFov;
  }

  set horizontalFov(deg: number) {
    this.settings.horizontalFov = clamp(deg, FOV_LIMITS.min, FOV_LIMITS.max);
    this.save();
  }

  private load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULTS };
      }
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        horizontalFov: clamp(
          parsed.horizontalFov ?? DEFAULTS.horizontalFov,
          FOV_LIMITS.min,
          FOV_LIMITS.max,
        ),
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // localStorage may be unavailable (private mode / quota); ignore.
    }
  }
}
