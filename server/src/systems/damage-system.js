import { System, Not } from 'ecsy';

import { Health } from '../components/health';
import { SufferDamage } from '../components/suffer-damage';
import { Respawn } from '../components/respawn';
import { Timeout } from '../components/timeout';
import { Transform } from '../components/transform';

export class DamageSystem extends System {
  static queries = {
    sufferingEntities: {
      components: [Transform, Health, SufferDamage],
      listen: { added: true }
    },
    deaths: {
      components: [Transform, Health, Not(Respawn)],
      listen: { removed: true }
    },
    respawns: {
      components: [Transform, Health, Respawn],
      listen: { removed: true }
    }
  };

  execute(_delta, _time) {
    this.queries.sufferingEntities.added.forEach((entity) => {
      const health = entity.getMutableComponent(Health);
      const damage = entity.getComponent(SufferDamage).amount;
      entity.removeComponent(SufferDamage);

      health.value -= damage;

      if (health.value <= 0) {
        entity.removeComponent(Health);
      }
    });

    this.queries.deaths.removed.forEach((entity) => {
      // Have to check for respawn, Not(Respawn) doesn't work properly for reactive queries.
      if (entity.alive && !entity.hasRemovedComponent(Respawn) && entity.hasRemovedComponent(Health)) {
        entity.remove();
      }
    });

    this.queries.respawns.removed.forEach((entity) => {
      if (entity.hasRemovedComponent(Health) && entity.hasComponent(Respawn)) {
          const transform = entity.getMutableComponent(Transform);
          entity.removeComponent(Transform);
          const timer = entity.getComponent(Respawn).timer;
          entity.addComponent(Timeout, { timer, addComponents: [transform, Health] });
      }
    });
  }
}
