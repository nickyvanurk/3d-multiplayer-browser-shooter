import { defineQuery, enterQuery } from 'bitecs';
import { Input, Keybindings } from '../components/components';

const enteredQuery = enterQuery(defineQuery([Input]));
const keybindingsQuery = defineQuery([Keybindings]);

export default (world) => {
  const inputId = enteredQuery(world)[0];
  const keybindingsId = keybindingsQuery(world)[0];

  if (inputId === undefined || keybindingsId === undefined) {
    return world;
  }

  document.addEventListener('keydown', (event) => {
    handleKeyEvent(inputId, keybindingsId, event);
  });

  document.addEventListener('keyup', (event) => {
    handleKeyEvent(inputId, keybindingsId, event);
  });

  document.addEventListener('mousedown', (_event) => {
    document.body.requestPointerLock();
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
      handleMouseMove(inputId, event);
    }
  });

  return world;
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

function handleMouseMove(inputId, event) {
  Input.mouseDelta[inputId][0] = event.movementX;
  Input.mouseDelta[inputId][1] = event.movementY;
}

function isModalVisisble() {
  for (const modal of [...document.getElementsByClassName('modal')]) {
    if (modal.style.display === 'block') {
      return true;
    }
  }

  return false;
}
