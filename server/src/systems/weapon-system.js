import { System, Not } from 'ecsy';

import { Weapon } from '../components/weapon';
import { Active } from '../components/active';

export class WeaponSystem extends System {
  static queries = {
    inactiveWeapons: {
      components: [Weapon, Not(Active)],
      listen: { added: true }
    },
    activeWeapons: {
      components: [Weapon, Active],
      listen: { added: true }
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute(_delta, time) {
    this.queries.inactiveWeapons.added.forEach((entity) => {
      const weapon = entity.getMutableComponent(Weapon);
      weapon.firing = false;
    });

    this.queries.activeWeapons.added.forEach((entity) => {
      const weapon = entity.getMutableComponent(Weapon);
      weapon.lastFiredTimestamp = time;
    });

    this.queries.activeWeapons.results.forEach((entity) => {
      const weapon = entity.getMutableComponent(Weapon);

      if (!weapon.firing && (weapon.lastFiredTimestamp + weapon.delay < time)) {
        weapon.lastFiredTimestamp = time;
        weapon.firing = true;
        console.log('t');
      }

      if (weapon.firing && (weapon.lastFiredTimestamp + weapon.fireInterval < time)) {
        weapon.lastFiredTimestamp = time;

        // TODO: Move addBullet logic here
        this.worldServer.addBullet(weapon);
      }
    });
  }
}
