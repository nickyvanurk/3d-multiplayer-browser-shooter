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
    const keybindings = this.keybindings;
    const crosshair = document.querySelector<SVGElement>('.crosshair');

    document.addEventListener('keydown', ({ code }) => {
      switch (code) {
        case keybindings.forward:
          input.forward = true;
          break;
        case keybindings.backward:
          input.backward = true;
          break;
        case keybindings.rollLeft:
          input.rollLeft = true;
          break;
        case keybindings.rollRight:
          input.rollRight = true;
          break;
        case keybindings.strafeLeft:
          input.strafeLeft = true;
          break;
        case keybindings.strafeRight:
          input.strafeRight = true;
          break;
        case keybindings.strafeUp:
          input.strafeUp = true;
          break;
        case keybindings.strafeDown:
          input.strafeDown = true;
          break;
        case keybindings.boost:
          input.boost = true;
          break;
      }
    });

    document.addEventListener('keyup', ({ code }) => {
      switch (code) {
        case keybindings.forward:
          input.forward = false;
          break;
        case keybindings.backward:
          input.backward = false;
          break;
        case keybindings.rollLeft:
          input.rollLeft = false;
          break;
        case keybindings.rollRight:
          input.rollRight = false;
          break;
        case keybindings.strafeLeft:
          input.strafeLeft = false;
          break;
        case keybindings.strafeRight:
          input.strafeRight = false;
          break;
        case keybindings.strafeUp:
          input.strafeUp = false;
          break;
        case keybindings.strafeDown:
          input.strafeDown = false;
          break;
        case keybindings.boost:
          input.boost = false;
          break;
      }
    });

    document.addEventListener('mousedown', ({ button }) => {
      switch (button) {
        case keybindings.weaponPrimary:
          input.weaponPrimary = true;
          break;
      }
    });

    document.addEventListener('mouseup', ({ button }) => {
      switch (button) {
        case keybindings.weaponPrimary:
          input.weaponPrimary = false;
          break;
      }
    });

    document.addEventListener('mousemove', (event) => {
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
  }

  // Update the aim ray from the current mouse + camera and return the input
  // payload consumed by the server (Messages.Input): all movement booleans plus
  // aim = { mouse:{x,y}, origin, direction, distance }.
  sample() {
    this.raycaster.setFromCamera(this.input.aim.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;

    this.input.aim.origin = origin;
    this.input.aim.direction = direction;

    return this.input;
  }
}
