import {System, Entity} from 'ecsy';

import {Destroy} from '../components/destroy';
import {CollisionStart} from '../components/collision-start';
import {DestroyOnCollision} from '../components/destroy-on-collision';
import {ParticleEffectOnDestroy} from '../components/particle-effect-on-destroy';
import {ParticleEffect} from '../components/particle-effect';
import {Transform}  from '../components/transform';

export class DestroySystem extends System {
  static queries: any = {
    entities: {
      components: [Destroy],
      listen: {
        added: true
      }
    },
    colliding: {
      components: [CollisionStart, DestroyOnCollision],
      listen: {
        added: true
      }
    }
  };

  execute() {
    this.queries.entities.added.forEach((entity: Entity) => {
      // @ts-ignore
      if (entity.alive) {
        if (entity.hasComponent(ParticleEffectOnDestroy)) {
          const type = entity.getComponent(ParticleEffectOnDestroy).type;
          this.world.createEntity()
            .addComponent(Transform, {
              position: entity.getComponent(Transform).position
            })
            .addComponent(ParticleEffect, {type});
        }

        entity.remove();
      }
    });

    this.queries.colliding.added.forEach((entity: Entity) => {
      // @ts-ignore
      if (entity.alive) {
        if (entity.hasComponent(ParticleEffectOnDestroy)) {
          const type = entity.getComponent(ParticleEffectOnDestroy).type;
          this.world.createEntity()
            .addComponent(Transform, {
              position: entity.getComponent(Transform).position
            })
            .addComponent(ParticleEffect, {type});
        }

        entity.remove();
      }
    });
  }
}
