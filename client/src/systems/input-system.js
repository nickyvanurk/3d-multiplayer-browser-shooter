import { System } from 'ecsy';

import { InputState } from '../components/input-state';

export class InputSystem extends System {
  static queries = {
    inputStates: {
      components: [InputState],
      listen: { added: true }
    }
  };

  init() {
    this.world.createEntity().addComponent(InputState);
  }

  execute() {
    this.queries.inputStates.added.forEach((entity) => {
      const component = entity.getMutableComponent(InputState);

      document.addEventListener('keydown', (event) => {
        if (component.keysDown.indexOf(event.code) === -1) {
          component.keysDown.push(event.code);
        }
      });

      document.addEventListener('keyup', (event) => {
        if (component.keysDown.indexOf(event.code) !== -1) {
          component.keysDown = component.keysDown.filter((item) => item !== event.code);
        }
      });

      document.addEventListener('mousedown', (event) => {
        if (!component.mouseButtonsDown.includes(event.button)) {
          component.mouseButtonsDown.push(event.button);
        }
      });

      document.addEventListener('contextmenu', (event) => {
        if (!component.mouseButtonsDown.includes(event.button)) {
          component.mouseButtonsDown.push(event.button);
        }

        event.preventDefault();
      });

      document.addEventListener('mouseup', (event) => {
        if (component.mouseButtonsDown.includes(event.button)) {
          component.mouseButtonsDown = component.mouseButtonsDown.filter((item) => {
            item !== event.button;
          });
        }
      });

      document.addEventListener('mousemove', (event) => {
        component.mousePosition = {
          x: ((event.clientX/window.innerWidth)*2 - 1).toFixed(3),
          y: (-(event.clientY/window.innerHeight)*2 + 1).toFixed(3)
        };

        // document.querySelector('.crosshair').setAttribute('style',`
        //   left: ${event.clientX/window.innerWidth*100}%;
        //   top: ${event.clientY/window.innerHeight*100}%;
        // `);
      });
    });
  }
}
