import { defineQuery } from 'bitecs';
import { Input, Position } from '../components';

const speed = 10;

const inputQuery = defineQuery([Input]);
const positionQuery = defineQuery([Position]);

export default (world, delta) => {
  const inputId = inputQuery(world)[0];
  if (inputId === undefined) {
    return world;
  }

  const ents = positionQuery(world);
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i];

    const inputZ = Input.backward[eid] - Input.forward[eid];
    const inputX = Input.strafeRight[eid] - Input.strafeLeft[eid];
    if (inputZ === 0 && inputX === 0) continue;

    Position.z[eid] += inputZ * speed * delta;
    Position.x[eid] += inputX * speed * delta;
  }

  return world;
}
