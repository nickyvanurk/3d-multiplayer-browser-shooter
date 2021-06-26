import { System, Not } from 'ecsy';
import { Vector3, Quaternion, Ray, Matrix4 } from 'three';

import logger from '../utils/logger';
import * as Spawner from '../spawner';

import { Weapon } from '../components/weapon';
import { Active } from '../components/active';
import { Transform } from '../components/transform';
import { Aim } from '../components/aim';

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
      // Have to check for active, Not(Active) doesn't work properly for reactive queries.
      if (entity.alive && !entity.hasComponent(Active)) {
        const weapon = entity.getMutableComponent(Weapon);
        weapon.firing = false;
      }
    });

    this.queries.activeWeapons.added.forEach((entity) => {
      const weapon = entity.getMutableComponent(Weapon);
      weapon.lastFiredTimestamp = time;
    });

    this.queries.activeWeapons.results.forEach((entity) => {
      if (!entity.alive) return;

      const weapon = entity.getMutableComponent(Weapon);

      if (!weapon.firing && (weapon.lastFiredTimestamp + weapon.delay < time)) {
        weapon.lastFiredTimestamp = time;
        weapon.firing = true;
      }

      if (weapon.firing && (weapon.lastFiredTimestamp + weapon.fireInterval < time)) {
        weapon.lastFiredTimestamp = time;

        if (weapon.parent.hasComponent(Transform)) {
          const { position, rotation } = getWeaponTransform(weapon);
          const damage = 5;

          Spawner.projectile(this.world, position, rotation, damage);
        }
      }
    });
  }
}

function getWeaponTransform(weapon) {
  const transform = weapon.parent.getComponent(Transform);
  const position = new Vector3()
      .copy(weapon.offset)
      .applyQuaternion(transform.rotation)
      .add(transform.position);
  let rotation = transform.rotation;

  if (weapon.parent.hasComponent(Aim)) {
    const ray = weapon.parent.getComponent(Aim);

    const target = new Vector3();
    new Ray(ray.position, ray.direction).at(ray.distance, target);

    const direction = new Vector3();
    direction.subVectors(target, position).normalize();

    const mx = new Matrix4().lookAt(direction, new Vector3(0,0,0), new Vector3(0,1,0));
    const qt = new Quaternion().setFromRotationMatrix(mx);
    rotation = qt;
  }

  return { position, rotation };
}
