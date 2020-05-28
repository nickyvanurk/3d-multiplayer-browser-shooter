import {System, Entity} from 'ecsy';
import {Damage} from '../components/damage';
import {CollisionStart} from '../components/collision-start';
import {Health} from '../components/health';
import {Destroy} from '../components/destroy';

export class HealthSystem extends System {
  static queries: any = {
    collidingDamageEntities: {
      components: [Damage, CollisionStart],
      listen: {
        added: true
      }
    }
  };

  execute() {
    this.queries.collidingDamageEntities.added.forEach((entity: Entity) => {
      const collidingEntities = entity.getComponent(CollisionStart).collidingWidth;
      const healthEntities = collidingEntities.filter(entity => entity.hasComponent(Health));

      healthEntities.forEach(healthEntity => {
        const healthComponent = healthEntity.getMutableComponent(Health);
        healthComponent.value -= entity.getComponent(Damage).value;

        if (healthComponent.value <= 0) {
          healthEntity.addComponent(Destroy);
        }
      });
    });
  }
}
