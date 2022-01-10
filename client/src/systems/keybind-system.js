import { defineQuery, enterQuery } from 'bitecs';
import { Keybindings } from '../components/components';

const enteredQuery = enterQuery(defineQuery([Keybindings]));

export default (world) => {
  const ents = enteredQuery(world);

  for (let i = 0; i < ents.length; ++i) {
    const eid = ents[i];

    // TODO: Load from storage or html
    Keybindings.forward[eid] = 'W'.charCodeAt(0);
    Keybindings.backward[eid] = 'S'.charCodeAt(0);
    Keybindings.strafeLeft[eid] = 'A'.charCodeAt(0);
    Keybindings.strafeRight[eid] = 'D'.charCodeAt(0);
  }
}
