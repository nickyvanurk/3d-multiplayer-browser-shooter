import { Object3D, Vector2, Vector3, Box3, Sphere } from 'three';

import Types from '../../../shared/types.ts';
import type { EntityKind } from '../../../shared/types.ts';
import {
  DEFAULT_BULLET_SPEED,
  DEFAULT_BULLET_TIMER,
} from '../../../shared/sim/entities/bullet.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { ViewRegistry } from './view-registry.ts';
import type { SceneManager } from './scene-manager.ts';

// The client tracks the server-owned local player id on the shared World.
type ClientWorld = World & { localPlayerId?: number };

// Bullet muzzle speed in world units per SECOND. Bullets fly at a fixed speed
// along the firing direction and do NOT inherit the shooter's velocity, so the
// firing solution is a plain stationary-shooter intercept at this speed.
const BULLET_SPEED = DEFAULT_BULLET_SPEED * 1000;

// How long a bullet lives (seconds). The intercept happens at t seconds and the
// bullet dies at this age, so a shot only connects when t <= this — beyond it the
// target is out of range and we hide the lead.
const BULLET_LIFETIME = DEFAULT_BULLET_TIMER / 1000;

// A per-entity 2D screen-space indicator, keyed by entity id.
export interface Indicator {
  position: Vector2;
  rotation: number;
  onscreen: boolean;
  // The ship's on-screen radius in pixels (its world bounding radius projected
  // at its current distance). Drives reticle sizing AND the aim-assist lock zone,
  // so both track the actual footprint at any ship size / distance. 0 if unknown.
  screenRadius: number;
}

// The coasting velocity read off a remote ship's physics body.
interface Velocity {
  x: number;
  y: number;
  z: number;
}

// A remote ship's body exposes its current world velocity via linvel(). On the
// client, entity.velocity is NOT this (it is left stale — the body coasts on the
// server-corrected linvel, and writeBackVelocity is off), so the firing solution
// must read the body directly.
interface LinvelBody {
  linvel(): Velocity;
}

// Smallest positive time (seconds) at which a bullet of speed `speed` fired from
// `muzzle` intercepts a target at `targetPos` moving at `targetVel` (units/s),
// or null if the target outruns the bullet. Solves
// |D + Vt·t| = speed·t  =>  (Vt·Vt − s²)t² + 2(D·Vt)t + D·D = 0, D = target − muzzle.
function interceptTime(
  muzzle: Vector3,
  targetPos: Vector3,
  targetVel: Velocity,
  speed: number,
): number | null {
  const dx = targetPos.x - muzzle.x;
  const dy = targetPos.y - muzzle.y;
  const dz = targetPos.z - muzzle.z;

  const a =
    targetVel.x * targetVel.x +
    targetVel.y * targetVel.y +
    targetVel.z * targetVel.z -
    speed * speed;
  const b = 2 * (dx * targetVel.x + dy * targetVel.y + dz * targetVel.z);
  const c = dx * dx + dy * dy + dz * dz;

  // Target moving at (nearly) bullet speed collapses the quadratic to linear.
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) {
      return null;
    }
    const t = -c / b;
    return t > 0 ? t : null;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }
  const sqrt = Math.sqrt(disc);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);

  // Smallest strictly-positive root.
  let t = Infinity;
  if (t1 > 0) {
    t = t1;
  }
  if (t2 > 0 && t2 < t) {
    t = t2;
  }
  return Number.isFinite(t) ? t : null;
}

// Ports projection-system.js: projects each non-player ship's world position to
// screen space, producing a per-entity 2D indicator (pixel position, on-screen
// edge angle, and an onscreen flag). HUD and aim-assist read `this.indicators`.
// Each indicator is a plain record (position/rotation, onscreen flag) keyed by
// entity id.
export class ProjectionService {
  world: ClientWorld;
  sceneManager: SceneManager;
  dummy: Object3D;
  indicators: Map<number, Indicator>;
  // Screen-space firing-lead point per enemy ship: where to aim to hit it,
  // keyed by entity id. Only present when a valid intercept exists and the aim
  // point is in front of the camera. HUD draws a ring + guide line from these.
  leads: Map<number, Vector2>;
  // Distance (camera -> lead world point) per enemy, in world units. Aim-assist
  // snaps the weapon convergence to this so bullets meet the target at the lead.
  leadDistances: Map<number, number>;
  viewRegistry: ViewRegistry;
  // World-space bounding radius of each ship model at scale 1, computed once per
  // kind from its loaded model and multiplied by the entity's scale on use.
  modelRadii: Map<EntityKind, number>;
  private readonly scratchAim: Vector3;
  private readonly scratchBox: Box3;
  private readonly scratchSphere: Sphere;
  // Smoothed render position (authoritative pose + Fiedler error offset) and a
  // scratch for its screen projection, so HUD indicators/leads track the drawn
  // mesh instead of the hard-snapping authoritative position.
  private readonly scratchRender: Vector3;
  private readonly scratchProject: Vector3;

  constructor(
    world: ClientWorld,
    sceneManager: SceneManager,
    viewRegistry: ViewRegistry,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.viewRegistry = viewRegistry;
    this.dummy = new Object3D();
    this.indicators = new Map(); // entity.id -> Indicator
    this.leads = new Map();
    this.leadDistances = new Map();
    this.modelRadii = new Map();
    this.scratchAim = new Vector3();
    this.scratchBox = new Box3();
    this.scratchSphere = new Sphere();
    this.scratchRender = new Vector3();
    this.scratchProject = new Vector3();
  }

  // World-space bounding radius of a ship, from its model's bounding sphere (at
  // scale 1, computed once per kind) times the entity's own scale.
  shipWorldRadius(entity: Entity): number {
    let base = this.modelRadii.get(entity.type);
    if (base === undefined) {
      const model = this.viewRegistry.models.get(entity.type);
      base = model
        ? this.scratchBox
            .setFromObject(model)
            .getBoundingSphere(this.scratchSphere).radius
        : 0;
      this.modelRadii.set(entity.type, base);
    }
    return base * entity.transform.scale;
  }

  render(): void {
    const camera = this.sceneManager.camera;

    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;
    // Perspective scale: a world length L at distance d spans
    // L · halfHeight / (d · tan(vFov/2)) pixels vertically.
    const halfFovTan = Math.tan((camera.fov * Math.PI) / 180 / 2);

    const live = new Set<number>();

    // The local ship is the shooter; without it there is no firing solution.
    const ownedShip =
      this.world.localPlayerId != null
        ? this.world.get(this.world.localPlayerId)
        : undefined;
    const muzzle = ownedShip?.transform.position;

    for (const entity of this.world.entities.values()) {
      if (
        entity.type !== Types.Entities.SPACESHIP &&
        entity.type !== Types.Entities.VENDOR
      ) {
        continue;
      }
      if (entity.id === this.world.localPlayerId) {
        continue;
      }

      live.add(entity.id!);

      let indicator = this.indicators.get(entity.id!);
      if (!indicator) {
        indicator = {
          position: new Vector2(),
          rotation: 0,
          onscreen: false,
          screenRadius: 0,
        };
        this.indicators.set(entity.id!, indicator);
      }

      const transform = entity.transform;
      // Track the smoothed render pose (mesh position), not the snapping
      // authoritative transform, so indicators/leads don't pop on corrections.
      const renderPos = this.scratchRender
        .copy(transform.position)
        .add(transform.errorPosition);
      const projection = this.scratchProject.copy(renderPos).project(camera);

      indicator.position.x = projection.x * halfWidth;
      indicator.position.y = projection.y * halfHeight;

      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.position.copy(renderPos);
      this.dummy.applyMatrix4(camera.matrixWorldInverse);
      const localPosition = this.dummy.position;
      indicator.rotation = Math.atan2(localPosition.y, localPosition.x);

      indicator.onscreen = !(
        localPosition.z > 0 ||
        Math.abs(indicator.position.x) >= halfWidth ||
        Math.abs(indicator.position.y) >= halfHeight
      );

      // On-screen radius of the ship: its world bounding radius projected at its
      // current distance. `dummy.position` is in view space (camera at origin),
      // so its length is the camera distance.
      const distance = localPosition.length();
      indicator.screenRadius =
        distance > 1e-3
          ? (this.shipWorldRadius(entity) * halfHeight) /
            (distance * halfFovTan)
          : 0;

      // Firing-lead point: solve the intercept for enemy ships only (not the
      // friendly Vendor NPC), and only when the aim point sits in front of the
      // camera so it projects to a sensible screen position. The target's true
      // coasting velocity lives on its physics body, not entity.velocity.
      let lead: Vector2 | null = null;
      const body = entity.body as unknown as LinvelBody | null;
      if (muzzle && entity.type === Types.Entities.SPACESHIP && body?.linvel) {
        const vel = body.linvel();
        const t = interceptTime(muzzle, renderPos, vel, BULLET_SPEED);
        // t within the bullet's lifetime means a shot can actually reach the
        // intercept before it despawns; past that the target is out of range.
        if (t !== null && t <= BULLET_LIFETIME) {
          const aim = this.scratchAim
            .set(vel.x, vel.y, vel.z)
            .multiplyScalar(t)
            .add(renderPos);

          this.dummy.quaternion.copy(camera.quaternion);
          this.dummy.position.copy(aim);
          this.dummy.applyMatrix4(camera.matrixWorldInverse);
          if (this.dummy.position.z < 0) {
            // In view space the camera is the origin, so this length is the
            // camera->lead distance (captured before project() mutates aim).
            const leadDistance = this.dummy.position.length();
            aim.project(camera);
            let leadPoint = this.leads.get(entity.id!);
            if (!leadPoint) {
              leadPoint = new Vector2();
              this.leads.set(entity.id!, leadPoint);
            }
            leadPoint.set(aim.x * halfWidth, aim.y * halfHeight);
            this.leadDistances.set(entity.id!, leadDistance);
            lead = leadPoint;
          }
        }
      }
      if (!lead) {
        this.leads.delete(entity.id!);
        this.leadDistances.delete(entity.id!);
      }
    }

    for (const id of this.indicators.keys()) {
      if (!live.has(id)) {
        this.indicators.delete(id);
      }
    }
    for (const id of this.leads.keys()) {
      if (!live.has(id)) {
        this.leads.delete(id);
        this.leadDistances.delete(id);
      }
    }
  }
}
