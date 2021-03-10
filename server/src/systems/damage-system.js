import { System } from 'ecsy';

import { SufferDamage } from '../components/suffer-damage';
import { Health } from '../components/health';

export class DamageSystem extends System {
  static queries = {
    sufferingEntities: {
      components: [SufferDamage],
      listen: { added: true }
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute(_delta, _time) {
    this.queries.sufferingEntities.added.forEach((entity) => {
      const damage = entity.getComponent(SufferDamage).amount;
      const health = entity.getMutableComponent(Health);

      health.value -= damage;

      if (health.value <= 0) {
        entity.remove();
      }

      entity.removeComponent(SufferDamage);
    });

    //this.queries.collidingDamageEntities.results.forEach((entity) => {
    //  if (!entity.alive) return;

    //  const collidingWith = entity.getComponent(Collision).collidingWith;
    //  const entitiesWithHealth = collidingWith.filter((entity) => {
    //    return entity.alive && entity.hasComponent(Health) && !entity.hasComponent(Destroy)
    //  });

    //  entitiesWithHealth.forEach((healthyEntity) => {
    //    const health = healthyEntity.getMutableComponent(Health);

    //    health.value -= entity.getComponent(Damage).value;

    //    if (health.value <= 0) {
    //      healthyEntity.addComponent(Destroy);
    //      healthyEntity.addComponent(Respawn);
    //    }
    //  });
    //});
  }
}
