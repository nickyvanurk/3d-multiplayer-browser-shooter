import { System } from 'ecsy';
import { Vector2, Raycaster } from 'three';

import { Input } from '../../../shared/components/input';
import { Keybindings } from '../components/keybindings';
import { Camera } from '../components/camera';
import { Object3d } from '../components/object3d';

export class InputSystem extends System {
  static queries = {
    client: {
      components: [Input, Keybindings],
      listen: { added: true }
    },
    camera: {
      components: [Camera, Object3d]
    }
  };

  init() {
    this.mouse = new Vector2();
    this.raycaster = new Raycaster();
  }

  execute() {
    this.queries.client.added.forEach((entity) => {
      const input = entity.getMutableComponent(Input);
      const keybindings = entity.getComponent(Keybindings);

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
        this.mouse.x = ((event.clientX/window.innerWidth)*2 - 1);
        this.mouse.y = (-(event.clientY/window.innerHeight)*2 + 1);

        const entity = this.queries.camera.results[0];
        const camera = entity.getComponent(Object3d).value;

        this.raycaster.setFromCamera(this.mouse, camera);
        const { origin, direction } = this.raycaster.ray;

        input.aim = { origin, direction };
      });

      document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
    });
  }
}
