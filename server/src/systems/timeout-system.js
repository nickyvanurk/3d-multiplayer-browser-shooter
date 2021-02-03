import { System } from 'ecsy';

import { Timeout } from '../components/timeout';

export class TimeoutSystem extends System {
  static queries = {
    timeouts: {
      components: [Timeout]
    }
  };

  execute(delta, _time) {
    this.queries.timeouts.results.forEach((entity) => {
      const timeout = entity.getMutableComponent(Timeout);

      timeout.timer -= delta;

      if (timeout.timer < 0) {
        timeout.addComponents.forEach((component) => {
          entity.addComponent(component);
        });

        timeout.removeComponents.forEach((component) => {
          entity.removeComponent(component);
        });

        entity.removeComponent(Timeout);
      }
    });
  }
}
