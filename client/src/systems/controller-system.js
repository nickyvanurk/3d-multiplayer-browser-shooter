import { defineQuery } from 'bitecs';
import { Input, Position } from '../components';

const inputQuery = defineQuery([Input]);
const positionQuery = defineQuery([Position]);

export default (world) => {
  const inputId = inputQuery(world)[0];
  if (inputId === undefined) {
    return world;
  }

  const ents = positionQuery(world);
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i];

    if (Input.forward[inputId]) {
      Position.y[eid] += 1;
    }

    console.log(Position.y[eid]);
  }

  return world;
}
