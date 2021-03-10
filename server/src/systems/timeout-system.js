import { System } from 'ecsy';

import { Timeout } from '../components/timeout';
import { Transform } from '../components/transform';

const components = { Transform };

export class TimeoutSystem extends System {
  static queries = {
    timeouts: {
      components: [Timeout]
    }
  };

  execute(delta, _time) {
    this.queries.timeouts.results.forEach((entity) => {
      if (!entity.alive) return;

      const timeout = entity.getMutableComponent(Timeout);

      timeout.timer -= delta;

      if (timeout.timer < 0) {
        timeout.addComponents.forEach((component) => {
          if (typeof component === 'object') {
            if (!entity.hasComponent(component.constructor.name)) {
              const componentClass = components[component.constructor.name];
              const properties = {...component};

              Object.keys(properties)
                .filter(key => !componentClass.schema[key])
                .forEach(key => delete properties[key]);

              entity.addComponent(componentClass, properties);
            }
          } else {
            if (!entity.hasComponent(component)) {
              entity.addComponent(component);
            }
          }

        });

        timeout.removeComponents.forEach((component) => {
          if (entity.hasComponent(component)) {
            entity.removeComponent(component);
          }
        });

        entity.removeComponent(Timeout);
      }
    });
  }
}
