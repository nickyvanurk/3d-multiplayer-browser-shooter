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
import { Timeout } from './components/timeout';
import { Destroy } from './components/destroy';
import { Damage } from './components/damage';
import { DestroyOnCollision } from './components/destroy-on-collision';
import { Respawn } from './components/respawn';
import { RandomSpawn } from './components/random-spawn';

export function controllableSpaceship(ecs, player) {
  logger.debug(`Spawning spaceship`);

  const spaceship = ecs.createEntity()
    .addComponent(SpaceshipController, { player })
    .addComponent(Playing)
    .addComponent(Kind, { value: Types.Entities.SPACESHIP })
    .addComponent(Transform)
    .addComponent(RandomSpawn)
    .addComponent(RigidBody, {
      acceleration: 0.8,
      angularAcceleration: new Euler(0.15, 0.3, 0.05),
      damping: 0.5,
      angularDamping: 0.99
    })
    .addComponent(Aim)
    .addComponent(Health)
    .addComponent(Respawn);

  const weaponLeft = ecs.createEntity()
    .addComponent(Weapon, {
      offset: new Vector3(-0.5, 0, -0.5),
      delay: 50,
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

  spaceship.worldId = getWorldId(ecs, asteroid);

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

  asteroid.worldId = getWorldId(ecs, asteroid);

  return asteroid;
}

export function projectile(ecs, position, rotation, damage, speed = 0.1,  timer = 500) {
  const projectile = ecs.createEntity()
    .addComponent(Kind, { value: Types.Entities.BULLET })
    .addComponent(Transform, { position, rotation })
    .addComponent(RigidBody, {
      velocity: new Vector3(0, 0, -speed),
      kinematic: true
    })
    .addComponent(Timeout, {
      timer,
      addComponents: [Destroy]
    })
    .addComponent(Damage, { value: damage })
    .addComponent(DestroyOnCollision);

  projectile.worldId = getWorldId(ecs, asteroid);

  return projectile;
}


function getWorldId(ecs, entity) {
  const freeIndex = ecs.entities.findIndex(entity => entity === undefined);

  if (freeIndex !== -1) {
    ecs.entities[freeIndex] = entity;
    return freeIndex;
  }

  return ecs.entities.push(entity) - 1;
}
