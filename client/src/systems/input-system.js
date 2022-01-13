import { defineQuery, enterQuery } from 'bitecs';
import * as KeyCode from 'keycode';
import { Input, Keybindings } from '../components/components';

const defaultKbs = {
  forward: 'W'.charCodeAt(0),
  backward: 'S'.charCodeAt(0),
  strafeLeft: 'A'.charCodeAt(0),
  strafeRight: 'D'.charCodeAt(0),
};

const inputsEnteredQuery = enterQuery(defineQuery([Input]));
const kbsEnteredQuery = enterQuery(defineQuery([Keybindings]));

export default (world) => {
  const inputId = inputsEnteredQuery(world)[0];
  const kbsId = kbsEnteredQuery(world)[0];

  if (inputId === undefined || kbsId === undefined) {
    return world;
  }

  setKeybindingsFromLocalStorage(kbsId);

  addChangeKeybindingListeners(kbsId);
  addKeyboardListeners(inputId, kbsId);
  addMouseListeners(inputId);

  return world;
}

function setKeybindingsFromLocalStorage(kbsId) {
  for (const [action, inputElement] of Object.entries(getKeybindingInputElements())) {
    const defaultKeyCode = defaultKbs[action];
    inputElement.value = KeyCode(defaultKeyCode) || 'Not bound';

    if (window.localStorage.hasOwnProperty(action)) {
      const storedKeyCode = +window.localStorage.getItem(action);
      inputElement.value = storedKeyCode > 0 ? KeyCode(storedKeyCode) : 'Not bound';

      Keybindings[action][kbsId] = storedKeyCode;
    }
  }
}

function getKeybindingInputElements() {
  const inputs = {};
  [...document.getElementsByClassName('keybinding')].forEach((input) => {
    inputs[input.id] = input;
  });
  return inputs;
}

function addChangeKeybindingListeners(kbsId) {
  for (const [action, inputElement] of Object.entries(getKeybindingInputElements())) {
    inputElement.addEventListener('keydown', (event) => {
      event.preventDefault();
      setKeybinding(inputElement, kbsId, action, event.keyCode);
    });
  }
}

function setKeybinding(inputElement, kbsId, action, kCode) {
  const key = KeyCode(kCode);
  inputElement.value = key === 'esc' ? 'Not bound' : key;

  const keyCode = key === 'esc' ? -1 : kCode;
  window.localStorage.setItem(action, keyCode);

  Keybindings[action][kbsId] = keyCode;
}

function addKeyboardListeners(inputId, kbsId) {
  document.addEventListener('keydown', (event) => {
    handleKeyEvent(inputId, kbsId, event);
  });

  document.addEventListener('keyup', (event) => {
    handleKeyEvent(inputId, kbsId, event);
  });
}

function handleKeyEvent(inputId, keybindingsId, event) {
  if (event.repeat || isModalVisisble()) return;

  const actions = Object
    .keys(Keybindings)
    .filter(key => Keybindings[key][keybindingsId] === event.keyCode);

  for (const action of actions) {
    if (action) {
      Input[action][inputId] = event.type === 'keydown' ? 1 : 0;
    }
  }
}

function isModalVisisble() {
  for (const modal of [...document.getElementsByClassName('modal')]) {
    if (modal.style.display === 'block') {
      return true;
    }
  }

  return false;
}

function addMouseListeners(inputId) {
  document.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'BUTTON' || isModalVisisble()) return;
    document.body.requestPointerLock();
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
      handleMouseMove(inputId, event);
    }
  });
}

function handleMouseMove(inputId, event) {
  Input.mouseDelta[inputId][0] = event.movementX;
  Input.mouseDelta[inputId][1] = event.movementY;
}
