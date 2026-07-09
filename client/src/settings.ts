// User-tunable settings, persisted to localStorage so they survive reloads.
// FOV is stored as horizontal degrees (game convention); the renderer converts
// to the vertical FOV three.js expects based on the current aspect ratio.

const STORAGE_KEY = 'voidfall.settings';

export const FOV_LIMITS = { min: 60, max: 120 } as const;
// Chase-camera follow strength: the k in `1 - exp(-k * dt)`. Higher = snappier.
// Shown in the UI divided by 10 (raw 10..30 -> "1.0".."3.0").
export const CAMERA_STIFFNESS_LIMITS = { min: 10, max: 30 } as const;

export interface GameSettings {
  horizontalFov: number;
  cameraStiffness: number;
}

const DEFAULTS: GameSettings = {
  horizontalFov: 90,
  cameraStiffness: 15,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hasStoredSettings(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // localStorage may be unavailable (private mode); treat as a first visit.
    return false;
  }
}

export class SettingsStore {
  private settings: GameSettings;

  // True when no settings were stored yet — i.e. a first-time visitor. Captured
  // before load() (which never writes) so it reflects the pre-visit state.
  readonly isFirstVisit: boolean;

  constructor() {
    this.isFirstVisit = !hasStoredSettings();
    this.settings = this.load();
  }

  get horizontalFov(): number {
    return this.settings.horizontalFov;
  }

  set horizontalFov(deg: number) {
    this.settings.horizontalFov = clamp(deg, FOV_LIMITS.min, FOV_LIMITS.max);
    this.save();
  }

  get cameraStiffness(): number {
    return this.settings.cameraStiffness;
  }

  set cameraStiffness(k: number) {
    this.settings.cameraStiffness = clamp(
      k,
      CAMERA_STIFFNESS_LIMITS.min,
      CAMERA_STIFFNESS_LIMITS.max,
    );
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
        cameraStiffness: clamp(
          parsed.cameraStiffness ?? DEFAULTS.cameraStiffness,
          CAMERA_STIFFNESS_LIMITS.min,
          CAMERA_STIFFNESS_LIMITS.max,
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
