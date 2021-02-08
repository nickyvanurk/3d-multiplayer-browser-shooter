import { System } from 'ecsy';

import Messages from '../../../shared/messages';

import { Collision } from '../components/collision';
import { Damage } from '../components/damage';
import { Health } from '../components/health';
import { Dead } from '../components/dead';

export class HealthSystem extends System {
  static queries = {
    collidingDamageEntities: {
      components: [Collision, Damage]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute(_delta, _time) {
    this.queries.collidingDamageEntities.results.forEach((entity) => {
      if (!entity.alive) return;

      const collidingWith = entity.getComponent(Collision).collidingWith;
      const entitiesWithHealth = collidingWith.filter((entity) => {
        return entity.alive && entity.hasComponent(Health) && !entity.hasComponent(Dead)
      });

      entitiesWithHealth.forEach((healthyEntity) => {
        const health = healthyEntity.getMutableComponent(Health);

        health.value -= entity.getComponent(Damage).value;

        if (health.value <= 0) {
          healthyEntity.addComponent(Dead);
          this.worldServer.broadcast(
            new Messages.Despawn(healthyEntity.worldId),
            healthyEntity.worldId
          );
        }
      });
    });
  }
}
