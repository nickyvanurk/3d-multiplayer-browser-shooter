import { Raycaster, Vector3 } from 'three';

import { DEFAULT_KEYBINDINGS } from './keybindings.js';

// Ports input-system.js: attaches keyboard/mouse listeners, tracks pressed keys
// and the current mouse NDC, and computes the aim ray from the camera on sample().
//
// `input` is the single mutable source of truth for the local player's input.
// The aim-assist service mutates `input.aim.distance` on this same object.
export class InputController {
  constructor(camera, keybindings = DEFAULT_KEYBINDINGS) {
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
        mouse: new Vector3(),
      },
    };

    this.attach();
  }

  attach() {
    const input = this.input;
    const keybindings = this.keybindings;

    document.addEventListener('keydown', ({ code }) => {
      switch (code) {
        case keybindings.forward:     input.forward = true; break;
        case keybindings.backward:    input.backward = true; break;
        case keybindings.rollLeft:    input.rollLeft = true; break;
        case keybindings.rollRight:   input.rollRight = true; break;
        case keybindings.strafeLeft:  input.strafeLeft = true; break;
        case keybindings.strafeRight: input.strafeRight = true; break;
        case keybindings.strafeUp:    input.strafeUp = true; break;
        case keybindings.strafeDown:  input.strafeDown = true; break;
        case keybindings.boost:       input.boost = true; break;
      }
    });

    document.addEventListener('keyup', ({ code }) => {
      switch (code) {
        case keybindings.forward:     input.forward = false; break;
        case keybindings.backward:    input.backward = false; break;
        case keybindings.rollLeft:    input.rollLeft = false; break;
        case keybindings.rollRight:   input.rollRight = false; break;
        case keybindings.strafeLeft:  input.strafeLeft = false; break;
        case keybindings.strafeRight: input.strafeRight = false; break;
        case keybindings.strafeUp:    input.strafeUp = false; break;
        case keybindings.strafeDown:  input.strafeDown = false; break;
        case keybindings.boost:       input.boost = false; break;
      }
    });

    document.addEventListener('mousedown', ({ button }) => {
      switch (button) {
        case keybindings.weaponPrimary: input.weaponPrimary = true; break;
      }
    });

    document.addEventListener('mouseup', ({ button }) => {
      switch (button) {
        case keybindings.weaponPrimary: input.weaponPrimary = false; break;
      }
    });

    document.addEventListener('mousemove', (event) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const size = height < width ? height : width;

      const mouse = {
        x: ((event.clientX/size)*2 - width/size).toFixed(3),
        y: (-(event.clientY/size)*2 + height/size).toFixed(3)
      };

      mouse.x = mouse.x < -1 ? -1 : mouse.x > 1 ? 1 : mouse.x;
      mouse.y = mouse.y < -1 ? -1 : mouse.y > 1 ? 1 : mouse.y;

      input.aim.mouse = mouse;
    });

    document.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  // Update the aim ray from the current mouse + camera and return the input
  // payload consumed by the server (Messages.Input): all movement booleans plus
  // aim = { mouse:{x,y}, origin, direction, distance }.
  sample() {
    this.raycaster.setFromCamera(this.input.aim.mouse, this.camera);
    const { origin, direction } = this.raycaster.ray;

    this.input.aim.origin = origin;
    this.input.aim.direction = direction;

    return this.input;
  }
}
