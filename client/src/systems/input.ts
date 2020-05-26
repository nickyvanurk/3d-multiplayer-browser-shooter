import {System} from 'ecsy';
import {InputState} from '../components/input-state';

export class Input extends System {
  static queries: any = {
    inputStates: {
      components: [InputState],
      listen: {
        added: true
      }
    }
  };

  init() {
    this.world.createEntity().addComponent(InputState);
  }

  execute(delta: number) {
    this.queries.inputStates.added.forEach((entity: any) => {
      const state = entity.getMutableComponent(InputState);

      document.addEventListener('keydown', (event: any) => {
        if (state.keysDown.indexOf(event.code) === -1) {
          state.keysDown.push(event.code);
        }
      });

      document.addEventListener('keyup', (event: any) => {
        if (state.keysDown.indexOf(event.code) !== -1) {
          state.keysDown = state.keysDown.filter((item: any) => item !== event.code);
        }
      });

      document.addEventListener('mousedown', (event: any) => {
        if (!state.mouseButtonsDown.includes(event.button)) {
          state.mouseButtonsDown.push(event.button);
        }
      });

      document.addEventListener('mouseup', (event: any) => {
        if (state.mouseButtonsDown.includes(event.button)) {
          state.mouseButtonsDown = state.mouseButtonsDown.filter(
            (item: any) => item !== event.button);
        }
      });

      document.addEventListener('mousemove', (event: any) => {
        state.mousePosition = {
          x: (event.clientX/window.innerWidth)*2 - 1,
          y: -(event.clientY/window.innerHeight)*2 + 1
        };

        document.querySelector('.crosshair').setAttribute('style',`
          left: ${event.clientX/window.innerWidth*100}%;
          top: ${event.clientY/window.innerHeight*100}%;
        `);
      });
    });
  }
}
