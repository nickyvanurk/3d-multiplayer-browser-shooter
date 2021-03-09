import { Vector3, Euler } from 'three';

import logger from './utils/logger';
import Types from '../../shared/types';

import { Playing } from '../../shared/components/playing';
import { Transform } from './components/transform';
import { RigidBody } from './components/rigidbody';
import { SpaceshipController } from '../../shared/components/spaceship-controller';
import { Kind } from '../../shared/components/kind';
import { Weapon } from './components/weapon';
import { Weapons } from './components/weapons';
import { Aim } from './components/aim';
import { Health } from './components/health';

export function spawnControllableSpaceship(ecs, player, position = new Vector3()) {
  logger.debug(`Spawning spaceship`);

  const spaceship = ecs.createEntity()
    .addComponent(SpaceshipController, { player })
    .addComponent(Playing)
    .addComponent(Kind, { value: Types.Entities.SPACESHIP })
    .addComponent(Transform, { position })
    .addComponent(RigidBody, {
      acceleration: 0.8,
      angularAcceleration: new Euler(0.15, 0.3, 0.05),
      damping: 0.5,
      angularDamping: 0.99
    })
    .addComponent(Aim)
    .addComponent(Health);

  const weaponLeft = ecs.createEntity()
    .addComponent(Weapon, {
      offset: new Vector3(-0.5, 0, -0.5),
      fireInterval: 100,
      parent: spaceship
    });

  const weaponRight = ecs.createEntity()
    .addComponent(Weapon, {
      offset: new Vector3(0.5, 0, -0.5),
      fireInterval: 100,
      parent: spaceship
    });

  spaceship.addComponent(Weapons, {
    primary: [weaponLeft, weaponRight]
  });

  return spaceship;
}

export function asteroid(ecs, position, rotation, scale = 1) {
  const asteroid = ecs.createEntity()
    .addComponent(Kind, { value: Types.Entities.ASTEROID })
    .addComponent(Transform, { position, rotation, scale })
    .addComponent(RigidBody, {
      acceleration: 0,
      angularAcceleration: new Euler(0, 0, 0),
      damping: 0.001,
      angularDamping: 0.1,
      weight: scale <= 5 ? 1 : 0
    });

  return asteroid;
}
