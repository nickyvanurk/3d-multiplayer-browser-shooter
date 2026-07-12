// User-tunable settings, persisted to localStorage so they survive reloads.
// FOV is stored as horizontal degrees (game convention); the renderer converts
// to the vertical FOV three.js expects based on the current aspect ratio.

import {
  DEFAULT_KEYBINDINGS,
  mergeKeybindings,
  type Keybindings,
  type KeybindingAction,
} from './input/keybindings.ts';
import { applyBinding } from './input/rebind.ts';

const STORAGE_KEY = 'voidfall.settings';

export const FOV_LIMITS = { min: 60, max: 120 } as const;
// Chase-camera follow strength: the k in `1 - exp(-k * dt)`. Higher = snappier.
// Shown in the UI divided by 10 (raw 10..30 -> "1.0".."3.0").
export const CAMERA_STIFFNESS_LIMITS = { min: 10, max: 30 } as const;

export interface GameSettings {
  horizontalFov: number;
  cameraStiffness: number;
  keybindings: Keybindings;
}

const DEFAULTS: GameSettings = {
  horizontalFov: 90,
  cameraStiffness: 15,
  keybindings: { ...DEFAULT_KEYBINDINGS },
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

  // The live bindings object, shared with the InputController and HUDs so a
  // rebind takes effect immediately. Callers must not replace it — mutate via
  // rebind()/resetKeybindings() so the shared reference stays valid.
  get keybindings(): Keybindings {
    return this.settings.keybindings;
  }

  // Assign a key/button to an action (warn + unbind other on conflict), persist,
  // and return the actions whose binding was cleared by the conflict rule.
  rebind(action: KeybindingAction, value: string | number): KeybindingAction[] {
    const { bindings, unbound } = applyBinding(
      this.settings.keybindings,
      action,
      value,
    );
    Object.assign(this.settings.keybindings, bindings);
    this.save();
    return unbound;
  }

  resetKeybindings(): void {
    Object.assign(this.settings.keybindings, DEFAULT_KEYBINDINGS);
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
        keybindings: mergeKeybindings(parsed.keybindings),
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
