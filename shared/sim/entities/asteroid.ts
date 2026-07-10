import { Vector3, Euler } from 'three';
import { Entity } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import { asteroidMaxOre } from '../mining.ts';
import Types from '../../types.ts';

export interface AsteroidInit {
  id?: number;
  transform?: TransformInit;
  scale?: number;
}

export class Asteroid extends Entity {
  acceleration: number;
  angularAcceleration: Euler;
  // Mining state: an asteroid is a scalar ore quantity that any weapon depletes.
  // `health` doubles as ore-remaining so it flows through the existing combat +
  // respawn machinery and replicates in the health network slot for free.
  maxOre: number;
  health: number;
  // World position of the most recent damaging hit — where the mining subsystem
  // breaks the next ore chunk off, so ore drops on the face being shot. Combat
  // stamps it; defaults to the centre until the rock is first struck.
  lastImpact: Vector3;
  // Combat drives this dead -> respawn like a ship, but RespawnSubsystem revives
  // it IN PLACE (fresh ore, same spot) rather than teleporting it like a ship.
  respawn: boolean;
  respawnInPlace: boolean;
  respawnTimer: number;

  constructor({ id, transform, scale = 1 }: AsteroidInit = {}) {
    super({
      id,
      transform: { ...transform, scale },
      type: Types.Entities.ASTEROID,
    });
    this.acceleration = 0;
    this.angularAcceleration = new Euler(0, 0, 0);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.001;
    this.angularDamping = 0.1;
    // Static world geometry: a fixed rigid body (weight 0) that never moves. It is
    // mineable, not destructible-by-collision — it only depletes as ore is drawn.
    this.weight = 0;
    this.kinematic = false;

    this.maxOre = asteroidMaxOre(scale);
    this.health = this.maxOre;
    this.lastImpact = this.transform.position.clone();
    this.alive = true;
    this.respawn = true;
    this.respawnInPlace = true;
    this.respawnTimer = 0;
  }

  // Ore-remaining rides the health slot [14] the base leaves at 0, so the client
  // sees an asteroid shrink through the same World snapshot ships use.
  serializeNetworkState(): number[] {
    const state = super.serializeNetworkState();
    state[14] = this.health;
    return state;
  }
}
