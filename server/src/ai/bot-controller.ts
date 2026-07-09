import { Vector3, type Quaternion } from 'three';

import Types from '../../../shared/types.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import type { Ship } from '../../../shared/sim/entities/ship.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';

import type { BotProfile } from './bot-profile.ts';
import { AIM_MISS_BASE, BULLET_SPEED } from './bot-profile.ts';
import { FORWARD, leadIntercept } from './steering.ts';

type Rng = () => number;

function randomUnitVector(rng: Rng): Vector3 {
  for (let i = 0; i < 8; i++) {
    const x = rng() * 2 - 1;
    const y = rng() * 2 - 1;
    const z = rng() * 2 - 1;
    const len = Math.hypot(x, y, z);
    if (len > 1e-3 && len <= 1) {
      return new Vector3(x / len, y / len, z / len);
    }
  }
  return new Vector3(1, 0, 0);
}

// The bot ONLY produces control inputs (like moving a joystick); the ship's real
// physics flies it. Each tick it decides a heading to point at + whether to
// thrust/boost/fire, then converts the heading into aim-deflection input the same
// way a player's mouse does. It mostly CRUISES, commits to a fight when an enemy
// is within engageRange (after a reaction beat), and FLEES when hurt.
type FsmState = 'CRUISE' | 'ATTACK_RUN' | 'FIRING' | 'BREAK' | 'FLEE' | 'EVADE';

const ARENA_RADIUS = 1000;
const AIM_RESAMPLE_MS = 500;
// Turn PD control. MOUSE_SIGN flips the heading error into applyInput's
// deflection convention; TURN_DAMP subtracts the current turn rate to kill
// overshoot from the ship's angular momentum; TURN_SATURATION is the error (rad)
// at which deflection maxes out (eases in below it).
const MOUSE_SIGN = -1;
const TURN_DAMP = 0.35;
const TURN_SATURATION = 0.5;

export class BotController {
  ship: Ship;
  profile: BotProfile;
  private rng: Rng;

  private state: FsmState;
  private stateEnteredAt: number;
  private targetId: number | null;

  private committedTargetId: number | null;
  private commitAt: number;
  private engageCooldownUntil: number;

  private convergence: number;
  private fireHold: number;
  private aimErrorSample: Vector3;
  private nextAimSampleAt: number;

  private engagementTimer: number;
  private breakSign: number;
  private cruiseWaypoint: Vector3;
  private nextWaypointAt: number;
  private jinkSign: number;
  private nextJinkAt: number;

  private lastHealth: number;
  private boostAfterHitUntil: number;
  private wasAlive: boolean;

  constructor(ship: Ship, profile: BotProfile, rng: Rng) {
    this.ship = ship;
    this.profile = profile;
    this.rng = rng;

    this.state = 'CRUISE';
    this.stateEnteredAt = 0;
    this.targetId = null;
    this.committedTargetId = null;
    this.commitAt = 0;
    this.engageCooldownUntil = 0;

    this.convergence = 0;
    this.fireHold = 0;
    this.aimErrorSample = new Vector3();
    this.nextAimSampleAt = 0;

    this.engagementTimer = 0;
    this.breakSign = rng() < 0.5 ? 1 : -1;
    this.cruiseWaypoint = this.pickWaypoint();
    this.nextWaypointAt = 0;
    this.jinkSign = 1;
    this.nextJinkAt = 0;

    this.lastHealth = ship.health;
    this.boostAfterHitUntil = 0;
    this.wasAlive = true;
  }

  get fsmState(): string {
    return this.state;
  }

  private resetOnRespawn(): void {
    this.state = 'CRUISE';
    this.targetId = null;
    this.committedTargetId = null;
    this.convergence = 0;
    this.engagementTimer = 0;
    this.lastHealth = this.ship.health;
    this.cruiseWaypoint = this.pickWaypoint();
  }

  // Produce this bot's input for the tick. The ship's own update()/physics then
  // flies it. Must run before the entity update loop so Ship.update sees it.
  think(_world: World, dt: number, time: number): void {
    if (this.ship.alive === false) {
      this.wasAlive = false;
      return;
    }
    if (!this.wasAlive) {
      this.resetOnRespawn();
      this.wasAlive = true;
    }

    if (this.ship.health < this.lastHealth) {
      this.boostAfterHitUntil = time + 800;
    }
    this.lastHealth = this.ship.health;

    const pos = this.ship.transform.position;
    const rot = this.ship.transform.rotation;
    const forward = FORWARD.clone().applyQuaternion(rot);

    const target = this.selectTarget(_world, pos, forward);

    let dirToTarget = forward;
    let distance = Infinity;
    let noseOnTarget = 1;
    if (target) {
      const toTarget = new Vector3().subVectors(target.transform.position, pos);
      distance = toTarget.length();
      dirToTarget =
        distance > 1e-6 ? toTarget.multiplyScalar(1 / distance) : forward;
      noseOnTarget = forward.dot(dirToTarget);
    }

    this.updateState(target, distance, noseOnTarget, dt, time);
    this.updateConvergence(target, distance, noseOnTarget, dt);

    const decision = this.decide(
      target,
      pos,
      dirToTarget,
      distance,
      forward,
      time,
    );
    const input = this.toInput(
      target,
      pos,
      rot,
      distance,
      noseOnTarget,
      decision,
      time,
    );

    this.ship.controller = this.ship.controller ?? { lastInput: input };
    this.ship.controller.lastInput = input;
    this.ship.inputBits = input.toBits();
  }

  private selectTarget(
    world: World,
    pos: Vector3,
    forward: Vector3,
  ): Ship | null {
    const cosFov = Math.cos((this.profile.acquireFovDeg * Math.PI) / 180 / 2);
    let best: Ship | null = null;
    let bestDist = Infinity;
    for (const entity of world.entities.values()) {
      if (
        entity.type !== Types.Entities.SPACESHIP ||
        entity === (this.ship as unknown as Entity) ||
        entity.destroyed ||
        entity.alive === false
      ) {
        continue;
      }
      const toTarget = new Vector3().subVectors(entity.transform.position, pos);
      const dist = toTarget.length();
      if (dist > this.profile.detectionRange || dist < 1e-6) {
        continue;
      }
      const inFov = toTarget.multiplyScalar(1 / dist).dot(forward) >= cosFov;
      if (!inFov && entity.id !== this.targetId) {
        continue;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = entity as Ship;
      }
    }
    this.targetId = best ? (best.id ?? null) : null;
    return best;
  }

  private setState(next: FsmState, time: number): void {
    if (next === this.state) {
      return;
    }
    this.state = next;
    this.stateEnteredAt = time;
    if (next === 'ATTACK_RUN' || next === 'CRUISE') {
      this.engagementTimer = 0;
    }
  }

  private toCruise(time: number): void {
    this.engageCooldownUntil = time + 2500 + this.rng() * 3500;
    this.committedTargetId = null;
    this.setState('CRUISE', time);
  }

  private updateState(
    target: Ship | null,
    distance: number,
    noseOnTarget: number,
    dt: number,
    time: number,
  ): void {
    const p = this.profile;
    const health = this.ship.health;
    const recentlyHit = time < this.boostAfterHitUntil;
    const sinceState = time - this.stateEnteredAt;

    if (this.state === 'FLEE') {
      if (health > p.retreatHealth * 1.6 || sinceState > 3500) {
        this.toCruise(time);
      }
      return;
    }
    if (health < p.retreatHealth) {
      this.setState('FLEE', time);
      return;
    }

    if (this.state === 'EVADE') {
      if (sinceState > 700) {
        this.setState(this.committedTargetId ? 'ATTACK_RUN' : 'CRUISE', time);
      }
      return;
    }
    if (
      recentlyHit &&
      target &&
      distance < p.engageRange &&
      this.state !== 'BREAK'
    ) {
      this.setState('EVADE', time);
      return;
    }

    const inEngageRange =
      !!target && distance <= p.engageRange && time >= this.engageCooldownUntil;
    if (inEngageRange && target) {
      if (this.committedTargetId !== target.id) {
        this.committedTargetId = target.id ?? null;
        this.commitAt = time + p.reactionMs;
      }
    } else if (this.state === 'CRUISE') {
      this.committedTargetId = null;
    }
    const committed =
      inEngageRange &&
      !!target &&
      time >= this.commitAt &&
      this.committedTargetId === target.id;

    const overshoot = distance < p.breakOffRange * 2 && noseOnTarget < -0.1;
    const tooClose = distance < p.breakOffRange;
    const inCone = noseOnTarget >= Math.cos((p.fireConeDeg * Math.PI) / 180);

    switch (this.state) {
      case 'CRUISE':
        if (committed) {
          this.setState('ATTACK_RUN', time);
        }
        break;
      case 'ATTACK_RUN':
        if (!committed || !target) {
          this.toCruise(time);
        } else if (tooClose || overshoot) {
          this.breakSign = -this.breakSign;
          this.setState('BREAK', time);
        } else if (distance <= p.fireRange && noseOnTarget > 0.3) {
          this.setState('FIRING', time);
        }
        break;
      case 'FIRING':
        this.engagementTimer += dt;
        if (!committed || !target) {
          this.toCruise(time);
        } else if (
          tooClose ||
          overshoot ||
          this.engagementTimer > p.patienceMs
        ) {
          this.breakSign = -this.breakSign;
          this.setState('BREAK', time);
        } else if (!inCone && distance > p.fireRange * 0.6) {
          this.setState('ATTACK_RUN', time);
        }
        break;
      case 'BREAK':
        if (sinceState > p.breakMs + p.repositionMs) {
          if (target && distance <= p.engageRange && this.rng() > 0.25) {
            this.setState('ATTACK_RUN', time);
          } else {
            this.toCruise(time);
          }
        }
        break;
    }
  }

  private updateConvergence(
    target: Ship | null,
    distance: number,
    noseOnTarget: number,
    dt: number,
  ): void {
    const p = this.profile;
    // FS2 time_enemy_in_range: the aim settles the longer the enemy stays in
    // range and roughly ahead — it does NOT require a perfect nose lock (this
    // momentum-limited ship can't hold one on a jinking target). Convergence
    // shrinks the aim error so committed passes actually land hits.
    const engaging = !!target && distance <= p.fireRange && noseOnTarget > 0;
    if (engaging) {
      this.convergence = Math.min(1, this.convergence + dt / p.convergenceMs);
    } else {
      this.convergence = Math.max(
        0,
        this.convergence - (dt / p.convergenceMs) * 1.5,
      );
    }
  }

  // Decide where to point and whether to boost, per state. Returns a world-space
  // heading for the nose plus a boost flag.
  private decide(
    target: Ship | null,
    pos: Vector3,
    dirToTarget: Vector3,
    distance: number,
    forward: Vector3,
    time: number,
  ): { facing: Vector3; boost: boolean } {
    const p = this.profile;

    switch (this.state) {
      case 'CRUISE':
        return { facing: this.cruiseHeading(pos, forward, time), boost: false };
      case 'ATTACK_RUN': {
        if (!target)
          return {
            facing: this.cruiseHeading(pos, forward, time),
            boost: false,
          };
        const lead =
          leadIntercept(
            pos,
            this.ship.velocity,
            target.transform.position,
            target.velocity ?? ORIGIN,
            BULLET_SPEED,
          ) ?? target.transform.position.clone();
        return {
          facing: new Vector3().subVectors(lead, pos).normalize(),
          boost: distance > p.boostRange,
        };
      }
      case 'FIRING':
        return { facing: target ? dirToTarget.clone() : forward, boost: false };
      case 'BREAK': {
        const base = target ? dirToTarget.clone().negate() : forward;
        const facing = this.sideways(base, this.breakSign, 0.6);
        return { facing, boost: time - this.stateEnteredAt < p.breakMs };
      }
      case 'FLEE': {
        const away = target ? dirToTarget.clone().negate() : this.homeward(pos);
        return { facing: this.jink(away, time), boost: true };
      }
      case 'EVADE': {
        const away = target ? dirToTarget.clone().negate() : forward;
        const facing = this.sideways(
          away,
          this.breakSign,
          0.5 + p.evasiveness * 0.5,
        );
        return { facing, boost: true };
      }
    }
    return { facing: forward, boost: false };
  }

  private cruiseHeading(pos: Vector3, forward: Vector3, time: number): Vector3 {
    const toWp = new Vector3().subVectors(this.cruiseWaypoint, pos);
    if (toWp.length() < 150 || time >= this.nextWaypointAt) {
      this.cruiseWaypoint = this.pickWaypoint();
      this.nextWaypointAt = time + 5000 + this.rng() * 5000;
      toWp.subVectors(this.cruiseWaypoint, pos);
    }
    return toWp.lengthSq() > 1e-6 ? toWp.normalize() : forward;
  }

  private sideways(base: Vector3, sign: number, amount: number): Vector3 {
    let up = new Vector3(0, 1, 0);
    if (Math.abs(base.dot(up)) > 0.95) up = new Vector3(1, 0, 0);
    const across = new Vector3()
      .crossVectors(base, up)
      .normalize()
      .multiplyScalar(sign * amount);
    return base.clone().add(across).normalize();
  }

  private homeward(pos: Vector3): Vector3 {
    return pos.lengthSq() > 1e-6
      ? pos.clone().negate().normalize()
      : FORWARD.clone();
  }

  private jink(dir: Vector3, time: number): Vector3 {
    if (time >= this.nextJinkAt) {
      this.jinkSign = this.rng() < 0.5 ? 1 : -1;
      this.nextJinkAt = time + 900 + this.rng() * 700;
    }
    return this.sideways(dir, this.jinkSign, 0.2 * this.profile.evasiveness);
  }

  private pickWaypoint(): Vector3 {
    const v = randomUnitVector(this.rng);
    return v.multiplyScalar(ARENA_RADIUS * (0.3 + this.rng() * 0.6));
  }

  // Convert the desired heading + intents into an InputCommand — the same shape a
  // player's client produces. aim.mouse.x/y steer the ship (like the player's
  // mouse); aim.origin/direction aim the guns; forward/boost are throttle.
  private toInput(
    target: Ship | null,
    pos: Vector3,
    rot: Quaternion,
    distance: number,
    noseOnTarget: number,
    decision: { facing: Vector3; boost: boolean },
    time: number,
  ): InputCommand {
    const p = this.profile;

    // Steering (PD control): express the heading error in the ship's local frame,
    // and damp with the current turn rate so the nose eases onto target instead of
    // overshooting under the ship's real angular momentum. Mapped to aim deflection
    // (saturates past TURN_SATURATION). MOUSE_SIGN matches applyInput's convention
    // (mouse.x>0 yaws the nose toward -local-x), so a target on +local-x needs a
    // negative deflection to turn toward it.
    const inv = rot.clone().invert();
    const local = decision.facing.clone().applyQuaternion(inv);
    const flat = Math.hypot(local.x, local.z) || 1e-6;
    const yawErr = Math.atan2(local.x, local.z);
    const pitchErr = Math.atan2(local.y, flat);
    const localW = this.ship.angularVelocity.clone().applyQuaternion(inv);
    const mouseX = clamp(
      (MOUSE_SIGN * yawErr + TURN_DAMP * localW.y) / TURN_SATURATION,
      -1,
      1,
    );
    const mouseY = clamp(
      (MOUSE_SIGN * pitchErr + TURN_DAMP * localW.x) / TURN_SATURATION,
      -1,
      1,
    );

    // Gun aim: point down the lead line to the target, plus the FS2 world-space
    // miss (shrinks with convergence). Falls back to the heading when no target.
    let shootDir = decision.facing;
    let fire = false;
    if (target && (this.state === 'FIRING' || this.state === 'ATTACK_RUN')) {
      const aimPoint =
        leadIntercept(
          pos,
          this.ship.velocity,
          target.transform.position,
          target.velocity ?? ORIGIN,
          BULLET_SPEED,
        ) ?? target.transform.position.clone();
      const missScale =
        (1 - p.accuracy) * AIM_MISS_BASE * (1 + 4 * (1 - this.convergence));
      if (time >= this.nextAimSampleAt) {
        this.aimErrorSample = randomUnitVector(this.rng);
        this.nextAimSampleAt = time + AIM_RESAMPLE_MS;
      }
      shootDir = aimPoint
        .clone()
        .addScaledVector(this.aimErrorSample, missScale)
        .sub(pos)
        .normalize();

      const inCone = noseOnTarget >= Math.cos((p.fireConeDeg * Math.PI) / 180);
      const inRange = distance <= p.fireRange;
      // Fire continuously while the target is in the firing solution — like FS2
      // (aicode.cpp: fires every frame the enemy is in cone+range; the weapon's
      // own fire_wait is the cadence) and like a player holding the trigger. NOT
      // artificial on/off bursts. fireHold just bridges brief nose wobble during a
      // pass so the trigger doesn't stutter off between frames.
      if (inCone && inRange) {
        this.fireHold = time + 300;
      }
      fire = inRange && time < this.fireHold;
    }

    return new InputCommand({
      // Always thrusting, like a player — never cut throttle to zero (that parks
      // the ship and it just rotates in place: the "not moving, wiggling" bug).
      forward: true,
      boost: decision.boost,
      weaponPrimary: fire,
      aim: {
        mouse: { x: mouseX, y: mouseY },
        origin: { x: pos.x, y: pos.y, z: pos.z },
        direction: { x: shootDir.x, y: shootDir.y, z: shootDir.z },
        distance: Number.isFinite(distance) ? distance : 1000,
      },
    });
  }
}

const ORIGIN = new Vector3(0, 0, 0);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
