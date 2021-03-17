import { System } from 'ecsy';

import { Transform } from '../../client/src/components/transform';
import { Range } from '../components/range';
import { RangeTarget } from '../components/range-target';

export class RangeSystem extends System {
  static queries = {
    rangedObjects: {
      components: [Transform, Range]
    },
    targetObjects: {
      components: [Transform, RangeTarget]
    }
  };

  execute() {
    const rangedObjects = this.queries.rangedObjects.results;
    const targetObjects = this.queries.targetObjects.results

    for (const ranged of rangedObjects) {
      const radius = ranged.getComponent(Range).radius;
      const rangedPosition = ranged.getComponent(Transform).position;

      for (const target of targetObjects) {
        if (ranged === target) continue;

        const targetPosition = target.getComponent(Transform).position;
        const inRange = ranged.getMutableComponent(Range).inRange;

        if (this.isInRange(rangedPosition, targetPosition, radius)) {
          if (!inRange.includes(target)) {
            inRange.push(target);
          }
        } else if (inRange.includes(target)) {
          inRange.splice(inRange.indexOf(target), 1);
        }
      }
    }
  }

  isInRange(p1, p2, r) {
    const t = p1.clone().sub(p2);
    return t.x*t.x + t.y*t.y + t.z*t.z < r*r;
  }
}
