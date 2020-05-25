import {System, Entity} from 'ecsy';

import {Gun} from '../components/gun';
import {Active} from '../components/active';

export class WeaponSystem extends System {
  static queries: any = {
    gunsActive: {
      components: [Gun, Active],
      listen: {
        added: [Active],
        removed: [Active]
      }
    }
  };

  init() {
  }

  execute(delta: number, time: number) {
    this.queries.gunsActive.added.forEach((gunEntity: Entity) => {
      const gun = gunEntity.getMutableComponent(Gun);
      gun.lastFiredTimestamp = time;
      console.log('Gun start...');
    });

    this.queries.gunsActive.results.forEach((gunEntity: Entity) => {
      const gun = gunEntity.getMutableComponent(Gun);

      if (gun.lastFiredTimestamp + gun.firingRate > time) {
        gun.lastFiredTimestamp = time;

        console.log('Firing!');
      }
    });

    this.queries.gunsActive.removed.forEach((gunEntity: Entity) => {
      const gun = gunEntity.getMutableComponent(Gun);
      gun.lastFiredTimestamp = null;

      // gun cooldown/recharge here?

      console.log('Gun reset...');
    });
  }
}
