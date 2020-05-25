import {System, Entity, Component, ComponentConstructor} from 'ecsy';

import {Timeout} from '../components/timeout';

export class TimeoutSystem extends System {
  static queries: any = {
    timeouts: {
      components: [Timeout]
    }
  };

  execute(delta: number) {
    this.queries.timeouts.results.forEach((timeoutEntity: Entity) => {
      const timeout = timeoutEntity.getMutableComponent(Timeout);

      timeout.timer -= delta;

      if (timeout.timer < 0) {
        timeout.timer = 0;

        timeout.addComponents.forEach((component: ComponentConstructor<Component>) => {
          timeoutEntity.addComponent(component);
        });

        timeout.removeComponents.forEach((component: ComponentConstructor<Component>) => {
          timeoutEntity.removeComponent(component);
        });

        timeoutEntity.removeComponent(Timeout);
      }
    });
  }
}
