import { defineQuery, enterQuery } from 'bitecs';
import { Keybindings } from '../components/components';
import * as KeyCode from 'keycode';

const defaultKeybindings = {
  forward: 'W'.charCodeAt(0),
  backward: 'S'.charCodeAt(0),
  strafeLeft: 'A'.charCodeAt(0),
  strafeRight: 'D'.charCodeAt(0),
};

const enteredQuery = enterQuery(defineQuery([Keybindings]));

export default (world) => {
  const ents = enteredQuery(world);

  for (let i = 0; i < ents.length; ++i) {
    const eid = ents[i];

    const inputElements = getKeybindingInputElements();

    for (const [action, inputElement] of Object.entries(inputElements)) {
      const defaultKeyCode = defaultKeybindings[action];
      inputElement.value = KeyCode(defaultKeyCode) || 'Not bound';

      if (window.localStorage.hasOwnProperty(action)) {
        const storedKeyCode = +window.localStorage.getItem(action);
        inputElement.value = storedKeyCode > 0 ? KeyCode(storedKeyCode) : 'Not bound';

        Keybindings[action][eid] = storedKeyCode;
      }

      inputElement.addEventListener('keydown', (event) => {
        event.preventDefault();

        const key = KeyCode(event.keyCode);
        inputElement.value = key === 'esc' ? 'Not bound' : key;

        const keyCode = key === 'esc' ? -1 : event.keyCode;
        window.localStorage.setItem(action, keyCode);

        Keybindings[action][eid] = keyCode;
      });
    }
  }

  return world;
}

function getKeybindingInputElements() {
  const inputs = {};

  [...document.getElementsByClassName('keybinding')].forEach((input) => {
    inputs[input.id] = input;
  });

  return inputs;
}
