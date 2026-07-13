import { Raycaster, Vector3 } from 'three';
import type { Camera } from 'three';

import { DEFAULT_KEYBINDINGS } from './keybindings.ts';
import type { Keybindings } from './keybindings.ts';
import { screenToNdc, screenToSteering } from './aim-math.ts';

interface AimState {
  origin: Vector3;
  direction: Vector3;
  distance: number;
  maxDistance: number;
  // Clamped, aspect-normalized deflection that drives ship yaw/pitch.
  mouse: { x: number; y: number };
  // True normalized device coords for the aim raycast (setFromCamera).
  ndc: { x: number; y: number };
}

// Free-look orbit state (Alt-held). yaw/pitch are radians accumulated from
// relative mouse motion while pointer-locked; consumed by the follow camera.
export interface OrbitState {
  active: boolean;
  yaw: number;
  pitch: number;
}

// Radians of orbit per pixel of mouse motion, and the pitch clamp that keeps
// the camera from tumbling over the poles.
const ORBIT_SENSITIVITY = 0.003;
const ORBIT_PITCH_LIMIT = 1.4;

interface InputState {
  forward: boolean;
  backward: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  strafeUp: boolean;
  strafeDown: boolean;
  boost: boolean;
  weaponPrimary: boolean;
  weaponSecondary: boolean;
  aim: AimState;
}

// Ports input-system.js: attaches keyboard/mouse listeners, tracks pressed keys
// and the current mouse NDC, and computes the aim ray from the camera on sample().
//
// `input` is the single mutable source of truth for the local player's input.
// The aim-assist service mutates `input.aim.distance` on this same object.
export class InputController {
  camera: Camera;
  keybindings: Keybindings;
  raycaster: Raycaster;
  input: InputState;
  // When false, keyboard/mouse events are ignored (e.g. while a menu is open).
  enabled = true;
  // Alt-held free-look. While active the mouse orbits the camera (not the ship)
  // and the ship's input freezes (maintained) until Alt is released.
  orbit: OrbitState = { active: false, yaw: 0, pitch: 0 };
  // Physical key/button state, tracked continuously (even during free-look) so
  // releasing Alt can resync `input` to whatever is actually still held.
  private heldKeys = new Set<string>();
  private heldButtons = new Set<number>();

  constructor(camera: Camera, keybindings: Keybindings = DEFAULT_KEYBINDINGS) {
    this.camera = camera;
    this.keybindings = keybindings;
    this.raycaster = new Raycaster();

    this.input = {
      forward: false,
      backward: false,
      rollLeft: false,
      rollRight: false,
      strafeLeft: false,
      strafeRight: false,
      strafeUp: false,
      strafeDown: false,
      boost: false,
      weaponPrimary: false,
      weaponSecondary: false,
      aim: {
        origin: new Vector3(),
        direction: new Vector3(),
        distance: 1000,
        maxDistance: 1000,
        mouse: { x: 0, y: 0 },
        ndc: { x: 0, y: 0 },
      },
    };

    this.attach();
  }

  attach() {
    const input = this.input;
    const crosshair = document.querySelector<SVGElement>('.crosshair');

    // heldKeys/heldButtons track physical state even during free-look; `input`
    // (fed to the ship) only follows them when not orbiting, so it freezes on
    // Alt-press and resyncs to whatever is still held on release.
    document.addEventListener('keydown', ({ code }) => {
      if (!this.enabled) {
        return;
      }
      this.heldKeys.add(code);
      if (!this.orbit.active) {
        this.applyKey(code, true);
      }
    });

    document.addEventListener('keyup', ({ code }) => {
      if (!this.enabled) {
        return;
      }
      this.heldKeys.delete(code);
      if (!this.orbit.active) {
        this.applyKey(code, false);
      }
    });

    document.addEventListener('mousedown', ({ button }) => {
      if (!this.enabled) {
        return;
      }
      this.heldButtons.add(button);
      if (!this.orbit.active) {
        this.applyButton(button, true);
      }
    });

    document.addEventListener('mouseup', ({ button }) => {
      if (!this.enabled) {
        return;
      }
      this.heldButtons.delete(button);
      if (!this.orbit.active) {
        this.applyButton(button, false);
      }
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.enabled) {
        return;
      }
      // While orbiting, relative motion swings the camera instead of aiming.
      // Flip either sign here if an axis feels inverted.
      if (this.orbit.active) {
        this.orbit.yaw -= event.movementX * ORBIT_SENSITIVITY;
        this.orbit.pitch += event.movementY * ORBIT_SENSITIVITY;
        this.orbit.pitch = Math.max(
          -ORBIT_PITCH_LIMIT,
          Math.min(ORBIT_PITCH_LIMIT, this.orbit.pitch),
        );
        return;
      }
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Steering deflection (clamped, aspect-normalized) drives yaw/pitch;
      // true NDC drives the aim raycast so bullets track the crosshair.
      input.aim.mouse = screenToSteering(
        event.clientX,
        event.clientY,
        width,
        height,
      );
      input.aim.ndc = screenToNdc(event.clientX, event.clientY, width, height);

      if (crosshair) {
        crosshair.style.left = `${(event.clientX / width) * 100}%`;
        crosshair.style.top = `${(event.clientY / height) * 100}%`;
      }
    });

    document.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    // Hold Alt to enter free-look; release to snap back. preventDefault stops
    // the browser stealing focus to the menu bar on a bare Alt press.
    document.addEventListener('keydown', (event) => {
      if (event.code !== this.keybindings.cameraOrbit) {
        return;
      }
      event.preventDefault();
      if (this.enabled && !this.orbit.active) {
        this.beginOrbit();
      }
    });
    document.addEventListener('keyup', (event) => {
      if (event.code !== this.keybindings.cameraOrbit) {
        return;
      }
      event.preventDefault();
      if (this.orbit.active) {
        this.endOrbit();
        // Hand control back: resync to keys/buttons still physically held.
        this.syncInputFromHeld();
      }
    });

    // Escape or any other pointer-lock loss ends free-look so it can't stick on.
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.orbit.active) {
        this.orbit.active = false;
        this.orbit.yaw = 0;
        this.orbit.pitch = 0;
        this.syncInputFromHeld();
      }
    });
    // Losing focus drops keyups, so held state can't be trusted: clear it and
    // let the ship coast rather than fly on a phantom key.
    window.addEventListener('blur', () => {
      this.heldKeys.clear();
      this.heldButtons.clear();
      if (this.orbit.active) {
        this.endOrbit();
      }
      this.clearInput();
    });
  }

  private beginOrbit(): void {
    this.orbit.active = true;
    this.orbit.yaw = 0;
    this.orbit.pitch = 0;
    // Freeze the ship's input as-is: while orbiting, keydown/keyup/mouse events
    // no longer touch `input`, so the ship maintains whatever it was doing (keep
    // boosting while you look behind, etc.). Released on Alt-up via resync.
    try {
      const request = document.body.requestPointerLock() as unknown;
      if (request && typeof (request as Promise<void>).then === 'function') {
        (request as Promise<void>).catch(() => {});
      }
    } catch {
      // Pointer lock is a nice-to-have; orbit still works off raw deltas.
    }
  }

  private endOrbit(): void {
    this.orbit.active = false;
    this.orbit.yaw = 0;
    this.orbit.pitch = 0;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  // Set the movement/fire boolean a key or button maps to.
  private applyKey(code: string, pressed: boolean): void {
    const { keybindings, input } = this;
    switch (code) {
      case keybindings.forward:
        input.forward = pressed;
        break;
      case keybindings.backward:
        input.backward = pressed;
        break;
      case keybindings.rollLeft:
        input.rollLeft = pressed;
        break;
      case keybindings.rollRight:
        input.rollRight = pressed;
        break;
      case keybindings.strafeLeft:
        input.strafeLeft = pressed;
        break;
      case keybindings.strafeRight:
        input.strafeRight = pressed;
        break;
      case keybindings.strafeUp:
        input.strafeUp = pressed;
        break;
      case keybindings.strafeDown:
        input.strafeDown = pressed;
        break;
      case keybindings.boost:
        input.boost = pressed;
        break;
    }
  }

  private applyButton(button: number, pressed: boolean): void {
    if (button === this.keybindings.weaponPrimary) {
      this.input.weaponPrimary = pressed;
    }
    if (button === this.keybindings.weaponSecondary) {
      this.input.weaponSecondary = pressed;
    }
  }

  // Zero every movement/fire boolean (steering left untouched).
  private clearButtons(): void {
    const input = this.input;
    input.forward = false;
    input.backward = false;
    input.rollLeft = false;
    input.rollRight = false;
    input.strafeLeft = false;
    input.strafeRight = false;
    input.strafeUp = false;
    input.strafeDown = false;
    input.boost = false;
    input.weaponPrimary = false;
    input.weaponSecondary = false;
  }

  // Zero all held movement/fire and steering so the ship coasts to a stop rather
  // than flying on stuck state (used when a menu opens or focus is lost).
  private clearInput(): void {
    this.clearButtons();
    this.input.aim.mouse = { x: 0, y: 0 };
  }

  // Rebuild `input` from the physically-held keys/buttons. Called when Alt is
  // released so controls resume from actual state, not the frozen snapshot.
  private syncInputFromHeld(): void {
    this.clearButtons();
    for (const code of this.heldKeys) {
      this.applyKey(code, true);
    }
    for (const button of this.heldButtons) {
      this.applyButton(button, true);
    }
  }

  // Toggle input processing. Disabling clears held movement/fire state so the
  // ship coasts to a stop (rather than flying on a stuck key) while a menu is up.
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearInput();
      if (this.orbit.active) {
        this.endOrbit();
      }
    }
  }

  // Update the aim ray from the current mouse + camera and return the input
  // payload fed to the owned ship each tick: all movement booleans plus
  // aim = { mouse:{x,y}, origin, direction, distance }.
  sample() {
    // Free-look (Alt) must not re-aim your weapons: while orbiting, the camera
    // swings but the aim ray is held where it was, so holding Alt looks around
    // without steering the mining beam / cannons. The steering mouse value is
    // already frozen in the orbit branch of the mousemove handler.
    if (!this.orbit.active) {
      this.raycaster.setFromCamera(this.input.aim.ndc, this.camera);
      const { origin, direction } = this.raycaster.ray;

      this.input.aim.origin = origin;
      this.input.aim.direction = direction;
    }

    return this.input;
  }
}
