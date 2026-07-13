import { Matrix4, Quaternion, Vector3 } from 'three';

import Types from '../../shared/types.ts';
import { InputCommand } from '../../shared/sim/input.ts';
import { Ship, weaponsForItem } from '../../shared/sim/entities/ship.ts';
import { Bullet } from '../../shared/sim/entities/bullet.ts';
import { getWeaponTransform } from '../../shared/sim/weapon.ts';
import type { Weapon } from '../../shared/sim/weapon.ts';
import { MINING_LASER_RANGE } from '../../shared/sim/mining.ts';
import type { World } from '../../shared/sim/world.ts';
import type { Entity, EntityWorld } from '../../shared/sim/entity.ts';
import type { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';

// Predicted-entity ids live far above the server's dense id range so they never
// collide with server-owned ids in the shared world map.
const CLIENT_ID_BASE = 1_000_000;

// Rendered length of the projectile beam (world units), matching the projectile
// model. The tracer's tip is spawned this far ahead of the muzzle so the beam
// emerges from the barrel instead of trailing back through the ship.
export const BULLET_LENGTH = 38;

// The mining laser's muzzle, relative to the ship (mirrors createMiningLaser's
// offset). Used to anchor a remote player's beam, whose weapon we don't own.
const MINING_LASER_MUZZLE = new Vector3(0, -0.6, 5);

// A beam's damage pulse fades over this long (ms) after each mining tick.
const BEAM_PULSE_DECAY_MS = 160;

// A remote player's beam lingers this long (ms) after their last relayed shot
// before we tear it down — a touch over the laser's fire interval so a steady
// stream of shots keeps it continuously lit.
const REMOTE_BEAM_LINGER_MS = 220;

// How far to probe along the aim ray to find the world point under the crosshair
// (effectively the line of sight); a miss falls back to this far point, so over
// empty space the beam simply runs parallel to the sightline.
const AIM_PROBE_RANGE = 100_000;

// Constants for building the beam's facing (Matrix4.lookAt) without allocating.
const LOOK_ORIGIN = new Vector3(0, 0, 0);
const LOOK_UP = new Vector3(0, 1, 0);

// The client-authoritative half of the sim. Ticks ONLY entities this client
// owns — its own ship (driven by local input, collided against the static
// asteroid field on the client's Rapier world) and the cosmetic bullets it
// predicts on fire. Remote entities stay pure mirrors updated by NetworkClient.
export class ClientSim {
  world: World;
  physics: RapierPhysicsWorld;
  ownedShip: Ship | null;
  predictedBullets: Bullet[];
  nextBulletId: number;
  // Emitted when the owned ship fires a predicted bullet, so NetworkClient can
  // send the matching authoritative Fire request to the server.
  onFire: ((bullet: Bullet) => void) | null;
  // Emitted when one of our predicted bullets strikes an enemy ship, with the
  // world-space impact point — the client hit prediction that drives the
  // (immediate) hitmarker + sound. The server still owns the actual damage; this
  // is cosmetic feedback only.
  onHitEnemy: ((impact: Vector3) => void) | null;
  // Emitted when one of our predicted bullets strikes an asteroid, with the
  // world-space impact point — drives an immediate dust puff at the hit. Cosmetic
  // (mining damage is server-authoritative).
  onHitAsteroid: ((impact: Vector3) => void) | null;
  // Emitted when one of OUR predicted bullets strikes a target: the authoritative
  // damage report (client-side hit detection). NetworkClient forwards it as a Hit;
  // the server validates + applies it. Remote tracers never fire this.
  onHit:
    | ((
        targetId: number,
        damage: number,
        miningFactor: number | undefined,
        impact: Vector3,
      ) => void)
    | null;

  private readonly scratch: Vector3;
  private readonly scratch2: Vector3;
  private readonly beamStep: Vector3;
  private readonly beamAim: Vector3;
  private readonly beamMatrix: Matrix4;
  private readonly beamRot: Quaternion;
  private readonly simWorld: EntityWorld;
  // The local player's live mining beam: one entity anchored to the muzzle while
  // the trigger is held (null otherwise), re-cast each frame. `nextBeamHit` gates
  // mining to the laser's cadence, not the frame rate.
  private ownedBeam: Bullet | null;
  private nextBeamHit: number;
  // Remote players' beams, keyed by shooter id, each refreshed by relayed Shots.
  private readonly remoteBeams: Map<number, Bullet>;
  private readonly remoteBeamExpiry: Map<number, number>;
  // Latest sim time, so Shot handlers (which carry no time) can stamp expiry.
  private simTime: number;

  constructor(world: World, physics: RapierPhysicsWorld) {
    this.world = world;
    this.physics = physics;
    this.ownedShip = null;
    this.predictedBullets = [];
    this.nextBulletId = CLIENT_ID_BASE;
    this.onFire = null;
    this.onHitEnemy = null;
    this.onHitAsteroid = null;
    this.onHit = null;
    this.scratch = new Vector3();
    this.scratch2 = new Vector3();
    this.beamStep = new Vector3();
    this.beamAim = new Vector3();
    this.beamMatrix = new Matrix4();
    this.beamRot = new Quaternion();
    this.ownedBeam = null;
    this.nextBeamHit = 0;
    this.remoteBeams = new Map();
    this.remoteBeamExpiry = new Map();
    this.simTime = 0;
    // Ship.update spawns bullets through this; we intercept to give them
    // client-range ids, track them, and notify the server.
    this.simWorld = { spawn: (entity) => this.spawnFromSim(entity) };
  }

  // The local player's ship became known (WELCOME/SPAWN). Make it controllable:
  // give it weapons + an input controller and a dynamic physics body. Here it is
  // simulated from local input; the server keeps its own dynamic mirror, snapped
  // to this client's reported State (correctBody) rather than self-simulated.
  setOwnedShip(ship: Ship): void {
    if (this.ownedShip === ship) {
      return;
    }
    this.ownedShip = ship;
    ship.controller = { lastInput: InputCommand.empty() };
    this.rebuildLoadout();
    if (!ship.body) {
      this.physics.add(ship);
    }
    // The owned ship is force-driven; its handling needs the full flight-model
    // damping. Re-assert it in case a WORLD snapshot corrected this ship as a
    // remote body (which disables damping) before WELCOME identified it as ours.
    this.physics.setFlightDamping?.(ship);
  }

  // Rebuild the owned ship's weapons from its loadout: whatever item sits in each
  // slot, built to fire on that slot's trigger (primary → LMB, secondary → RMB).
  // Called on ownership and whenever a Loadout message changes a slot.
  rebuildLoadout(): void {
    const ship = this.ownedShip;
    if (!ship) {
      return;
    }
    ship.weapons = [
      ...weaponsForItem(ship, ship.primaryItem, 'primary'),
      ...weaponsForItem(ship, ship.secondaryItem, 'secondary'),
    ];
  }

  // True while the local player's mining beam is live (laser trigger held with the
  // laser equipped). Drives the mining loop SFX.
  get miningActive(): boolean {
    return this.ownedBeam !== null;
  }

  // The beam's live damage pulse (0..1): rises to 1 on each mining tick and decays,
  // in lockstep with the visual pulse. Drives the mining loop's audio tremolo.
  get miningPulse(): number {
    return this.ownedBeam?.beamPulse ?? 0;
  }

  onSpawn(entity: Entity): void {
    // Every ship is simulated in the client physics world: the owned one is
    // input-driven, remote ones coast on their server-reported velocity and get
    // corrected each snapshot (NetworkClient.applyWorldState). This is what lets
    // the client sim the whole world and gives real ship-vs-ship collisions.
    if (entity.type === Types.Entities.SPACESHIP) {
      if (!entity.body) {
        this.physics.add(entity);
      }
      return;
    }
    // Asteroids are static world geometry, so a fixed client body always matches
    // the server pose — add them as colliders for local ship-vs-world collisions.
    if (entity.type === Types.Entities.ASTEROID) {
      this.physics.add(entity);
    }
    // The vendor NPC is a kinematic body dead-reckoned from its server-replicated
    // velocity (see update()); the owned ship physically bumps off it.
    if (entity.type === Types.Entities.VENDOR) {
      this.physics.add(entity);
    }
  }

  onDespawn(entity: Entity): void {
    if (entity.body) {
      this.physics.remove(entity);
    }
    if (entity === this.ownedShip) {
      this.ownedShip = null;
    }
    const i = this.predictedBullets.indexOf(entity as Bullet);
    if (i !== -1) {
      this.predictedBullets.splice(i, 1);
    }
  }

  update(dt: number, time: number, input: InputCommand): void {
    this.simTime = time;
    // Snapshot prev poses for every physics-simmed entity (all ships + predicted
    // bullets) so the renderer can interpolate between fixed steps.
    for (const entity of this.world.entities.values()) {
      if (
        (entity.type === Types.Entities.SPACESHIP ||
          entity.type === Types.Entities.VENDOR) &&
        entity.body
      ) {
        this.snapshotPrev(entity);
      }
    }
    for (const bullet of this.predictedBullets) {
      this.snapshotPrev(bullet);
    }

    const ship = this.ownedShip;
    if (ship && ship.alive !== false) {
      ship.controller!.lastInput = input;
      // applyInput + weapon fire; fired bullets spawn through simWorld.
      ship.update(dt, this.simWorld, time);
    }

    // Remote ships coast: no controller/weapons, so update() applies empty input
    // and the body drifts on its server-corrected velocity until the next snapshot.
    for (const entity of this.world.entities.values()) {
      if (
        entity.type === Types.Entities.SPACESHIP &&
        entity !== ship &&
        entity.alive !== false &&
        entity.body
      ) {
        entity.update(dt, this.simWorld, time);
      }
    }

    // The vendor's route runs server-side only; on the client dead-reckon its
    // kinematic body forward on the last server-replicated velocity so applyAll
    // drives the collider and the render lerp stays smooth between snapshots.
    // dt is milliseconds; velocity is units/second.
    for (const entity of this.world.entities.values()) {
      if (
        entity.type === Types.Entities.VENDOR &&
        entity.body &&
        entity.alive !== false
      ) {
        entity.transform.position.addScaledVector(entity.velocity, dt / 1000);
      }
    }

    // Match each mined asteroid's collider to its shrinking render (both driven
    // by the replicated ore), so predicted bullet raycasts and ship bumps meet
    // the rock at the size shown — not the original full-size hull.
    this.physics.syncAsteroidScales?.(this.world);

    this.physics.applyAll?.(this.world, dt);
    this.physics.step(dt);
    this.physics.drainCollisions(); // discard — hit detection is server-side

    this.integrateBullets(dt);

    // Beams follow the muzzle, so update them after the ship's pose is final.
    this.updateOwnedBeam(dt, time);
    this.updateRemoteBeams(dt, time);
  }

  private snapshotPrev(entity: Entity): void {
    entity.transform.prevPosition.copy(entity.transform.position);
    entity.transform.prevRotation.copy(entity.transform.rotation);
  }

  private integrateBullets(dt: number): void {
    for (const bullet of this.predictedBullets) {
      // Freshly spawned this tick: hold at the emerge pose (tail at the muzzle)
      // for its first frame so the beam leaves the barrel, then fly from the next.
      if (bullet.ageMs === 0) {
        bullet.update(dt);
        continue;
      }

      const from = this.scratch2.copy(bullet.transform.position);
      const step = this.scratch
        .copy(bullet.velocity)
        .applyQuaternion(bullet.transform.rotation)
        .multiplyScalar(dt);

      // Bullets carry no collider; raycast the path this frame, excluding the
      // shooter's own hull. On a hit the tracer is removed. The bullet mesh's
      // origin is its tip (see ViewRegistry), so `position` is the leading point
      // and nothing is ever drawn ahead of the impact. Every bullet (ours + remote
      // tracers) is cosmetic; only OUR shots report authoritative damage.
      const hit = this.physics.castSegment(from, step, bullet.owner);
      if (hit) {
        // Impact point (from + step·toi). Own shots flash the crosshair
        // hitmarker/sound on a ship; any shot throws a dust puff on rock.
        const impact = new Vector3().copy(from).addScaledVector(step, hit.toi);
        const owned = bullet.owner === this.ownedShip;
        if (hit.entity.type === Types.Entities.SPACESHIP) {
          if (owned) {
            this.onHitEnemy?.(impact);
          }
        } else if (hit.entity.type === Types.Entities.ASTEROID) {
          this.onHitAsteroid?.(impact);
        }
        // Client-side hit detection: report the hit the server applies (damage +
        // mining stay server-authoritative). Remote tracers never report.
        if (owned) {
          this.onHit?.(
            hit.entity.id!,
            bullet.damage ?? 0,
            bullet.miningFactor,
            impact,
          );
        }
        bullet.markDestroyed();
      } else {
        bullet.transform.position.copy(from).add(step);
      }
      bullet.update(dt); // ages the bullet; marks destroyed past its timeout
    }
    for (const bullet of [...this.predictedBullets]) {
      if (bullet.destroyed) {
        this.world.despawn(bullet.id!); // onDespawn drops it from the list
      }
    }
  }

  // Raycast a beam from its muzzle along its facing, up to its range, and store
  // the drawn muzzle→hit length on the beam. Returns the struck entity (with the
  // fraction along the ray) or null. `beamStep` holds the full muzzle→range vector
  // afterwards, so callers can resolve the exact impact point as muzzle + step·toi.
  private castBeamLength(beam: Bullet): { entity: Entity; toi: number } | null {
    const range = beam.beamRange!;
    this.beamStep
      .set(0, 0, 1)
      .applyQuaternion(beam.transform.rotation)
      .multiplyScalar(range);
    const hit = this.physics.castSegment(
      beam.transform.position,
      this.beamStep,
      beam.owner,
    );
    beam.beamLength = hit ? range * hit.toi : range;
    return hit;
  }

  // Facing that makes a beam fired from `muzzle` meet the crosshair: raycast the
  // camera aim ray against the world to find the point under the crosshair, then
  // aim the muzzle straight at it. This converges on the *actual* target distance,
  // so weapons with any range line up with the reticle (a far reticle target a
  // short beam can't reach still lines up — the beam just stops short). Returns a
  // reused quaternion; copy it if you need to keep it.
  private aimBeamAtCrosshair(ship: Ship, muzzle: Vector3): Quaternion {
    const aim = ship.aim;
    if (!aim) {
      return this.beamRot.copy(ship.transform.rotation);
    }
    const step = this.scratch2
      .copy(aim.direction)
      .multiplyScalar(AIM_PROBE_RANGE);
    const hit = this.physics.castSegment(aim.origin, step, ship);
    this.beamAim.copy(aim.origin).addScaledVector(step, hit ? hit.toi : 1);
    const dir = this.scratch.subVectors(this.beamAim, muzzle).normalize();
    this.beamMatrix.lookAt(dir, LOOK_ORIGIN, LOOK_UP);
    return this.beamRot.setFromRotationMatrix(this.beamMatrix);
  }

  // Drive the local player's mining beam. While the laser trigger is held, keep a
  // single beam entity anchored to the muzzle, re-cast each frame; report a mining
  // Hit on the laser's cadence (not per frame) so ore-per-second is unchanged, and
  // pulse the beam on each tick. Releasing the trigger tears the beam down.
  private updateOwnedBeam(dt: number, time: number): void {
    const ship = this.ownedShip;
    const weapon: Weapon | null =
      ship && ship.alive !== false
        ? (ship.weapons.find((w) => w.beamRange != null) ?? null)
        : null;
    const held =
      !!weapon &&
      (weapon.slot === 'secondary'
        ? ship!.firingSecondary
        : ship!.firingPrimary);

    if (!weapon || !held) {
      if (this.ownedBeam) {
        this.world.despawn(this.ownedBeam.id!);
        this.ownedBeam = null;
      }
      return;
    }

    // The muzzle is fixed by the weapon mount; the facing points at the world spot
    // under the crosshair (found by raycasting the aim ray) rather than converging
    // at a fixed aim distance — so the short-range beam still meets the crosshair.
    const { position } = getWeaponTransform(weapon);
    const rotation = this.aimBeamAtCrosshair(ship!, position);

    let beam = this.ownedBeam;
    if (!beam) {
      beam = new Bullet({
        transform: { position, rotation },
        beamRange: weapon.beamRange,
        damage: weapon.damage,
        miningFactor: weapon.miningFactor,
      });
      beam.owner = ship;
      // Resolve length BEFORE spawning: spawnWithId synchronously builds the view,
      // which reads beamLength to size the mesh.
      this.castBeamLength(beam);
      beam.transform.prevPosition.copy(position);
      beam.transform.prevRotation.copy(rotation);
      this.ownedBeam = beam;
      this.nextBeamHit = time; // first mining tick lands immediately
      this.world.spawnWithId(this.nextBulletId++, beam);
    } else {
      beam.transform.prevPosition.copy(beam.transform.position);
      beam.transform.prevRotation.copy(beam.transform.rotation);
      beam.transform.position.copy(position);
      beam.transform.rotation.copy(rotation);
    }

    const hit = this.castBeamLength(beam);

    while (time >= this.nextBeamHit) {
      // Report the muzzle so the server relays a Shot (speed 0) — this is what
      // drives other clients' copies of our beam.
      this.onFire?.(beam);
      if (hit) {
        const impact = new Vector3()
          .copy(beam.transform.position)
          .addScaledVector(this.beamStep, hit.toi);
        if (hit.entity.type === Types.Entities.SPACESHIP) {
          this.onHitEnemy?.(impact);
        } else if (hit.entity.type === Types.Entities.ASTEROID) {
          this.onHitAsteroid?.(impact);
        }
        this.onHit?.(
          hit.entity.id!,
          beam.damage ?? 0,
          beam.miningFactor,
          impact,
        );
        beam.beamPulse = 1;
      }
      this.nextBeamHit += weapon.fireInterval;
    }

    beam.beamPulse = Math.max(0, beam.beamPulse - dt / BEAM_PULSE_DECAY_MS);
  }

  // Advance every remote player's beam: follow its shooter's muzzle, re-cast its
  // length, decay its pulse, and tear it down once its shooter's shots stop
  // arriving (or the shooter dies).
  private updateRemoteBeams(dt: number, time: number): void {
    for (const [id, beam] of this.remoteBeams) {
      const shooter = this.world.get(id) as Ship | undefined;
      const expiry = this.remoteBeamExpiry.get(id) ?? 0;
      if (!shooter || shooter.alive === false || time > expiry) {
        this.world.despawn(beam.id!);
        this.remoteBeams.delete(id);
        this.remoteBeamExpiry.delete(id);
        continue;
      }
      beam.transform.prevPosition.copy(beam.transform.position);
      beam.transform.prevRotation.copy(beam.transform.rotation);
      const rot = shooter.transform.rotation;
      beam.transform.position
        .copy(MINING_LASER_MUZZLE)
        .applyQuaternion(rot)
        .add(shooter.transform.position);
      beam.transform.rotation.copy(rot);
      this.castBeamLength(beam);
      beam.beamPulse = Math.max(0, beam.beamPulse - dt / BEAM_PULSE_DECAY_MS);
    }
  }

  // A relayed mining shot from a remote player (Shot with speed 0). Spawn their
  // beam on first sight, then refresh its expiry + pulse; updateRemoteBeams makes
  // it follow that ship's muzzle. Cosmetic only — remote beams report no Hit.
  private refreshRemoteBeam(shooterId: number): void {
    const shooter = this.world.get(shooterId) as Ship | undefined;
    if (!shooter) {
      return;
    }
    let beam = this.remoteBeams.get(shooterId);
    if (!beam) {
      const muzzle = MINING_LASER_MUZZLE.clone()
        .applyQuaternion(shooter.transform.rotation)
        .add(shooter.transform.position);
      beam = new Bullet({
        transform: { position: muzzle, rotation: shooter.transform.rotation },
        beamRange: MINING_LASER_RANGE,
      });
      beam.owner = shooter;
      this.castBeamLength(beam);
      beam.transform.prevPosition.copy(beam.transform.position);
      beam.transform.prevRotation.copy(beam.transform.rotation);
      this.remoteBeams.set(shooterId, beam);
      this.world.spawnWithId(this.nextBulletId++, beam);
    }
    beam.beamPulse = 1;
    this.remoteBeamExpiry.set(shooterId, this.simTime + REMOTE_BEAM_LINGER_MS);
  }

  private spawnFromSim<T extends Entity>(entity: T): T {
    if (entity.type === Types.Entities.BULLET) {
      const bullet = entity as unknown as Bullet;
      const id = this.nextBulletId++;
      this.world.spawnWithId(id, entity);
      this.predictedBullets.push(bullet);
      // Report the true muzzle to the server BEFORE the visual offset below.
      this.onFire?.(bullet);

      // The tracer mesh's origin is its tip and it extends BULLET_LENGTH backward
      // (see ViewRegistry). The muzzle sits inside the hull, so leaving the tip
      // there would draw the whole beam back through the ship. Advance the tip one
      // length forward and anchor prev at it, so the first frame the beam sits in
      // the barrel pointing out and then flies — cosmetic only.
      const forward = this.scratch
        .set(0, 0, 1)
        .applyQuaternion(bullet.transform.rotation);
      bullet.transform.position.addScaledVector(forward, BULLET_LENGTH);
      bullet.transform.prevPosition.copy(bullet.transform.position);
      return entity;
    }
    return this.world.spawn(entity);
  }

  // A remote player's shot (relayed Shot). Spawn a cosmetic tracer owned by the
  // firing ship: it flies + self-raycasts locally (stopping on ships/asteroids,
  // dealing no damage) exactly like our own predicted tracers, but never reports a
  // Hit (its owner isn't ownedShip). Uses a client-range id like our own bullets.
  spawnRemoteTracer(
    position: Vector3,
    rotation: Quaternion,
    speed: number,
    shooterId: number,
  ): void {
    // A relayed shot with zero speed is a mining beam (it doesn't travel): route it
    // to the shooter's persistent, muzzle-following beam instead of a tracer.
    if (speed === 0) {
      this.refreshRemoteBeam(shooterId);
      return;
    }

    const bullet = new Bullet({ transform: { position, rotation }, speed });
    bullet.owner = this.world.get(shooterId) ?? null;
    this.world.spawnWithId(this.nextBulletId++, bullet);
    this.predictedBullets.push(bullet);
    // Same muzzle offset as spawnFromSim so the beam emerges from the barrel.
    const forward = this.scratch
      .set(0, 0, 1)
      .applyQuaternion(bullet.transform.rotation);
    bullet.transform.position.addScaledVector(forward, BULLET_LENGTH);
    bullet.transform.prevPosition.copy(bullet.transform.position);
  }
}

// Re-exported so callers can distinguish owned from server ids without importing
// the constant twice.
export { CLIENT_ID_BASE, Ship };
