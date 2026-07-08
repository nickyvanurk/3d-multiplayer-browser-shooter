import Types from '../../../shared/types.ts';
import type { Vector3 } from 'three';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { SceneManager } from './scene-manager.ts';

// The client tracks the server-owned local player id on the shared World.
type ClientWorld = World & { localPlayerId?: number };

// Ports shared/systems/range-system.js. In the client the only ranged object is
// the camera (Range radius 80 in the old game.js) and the targets are the
// non-player ships (RangeTarget). Tracks which ships are within radius of the
// camera in `this.inRange`.
export class RangeService {
  world: ClientWorld;
  sceneManager: SceneManager;
  radius: number;
  inRange: Entity[];

  constructor(world: ClientWorld, sceneManager: SceneManager, radius = 80) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.radius = radius;
    this.inRange = [];
  }

  update(): void {
    const rangedPosition = this.sceneManager.camera.position;
    const radius = this.radius;

    for (const target of this.targets()) {
      const targetPosition = target.transform.position;

      if (this.isInRange(rangedPosition, targetPosition, radius)) {
        if (!this.inRange.includes(target)) {
          this.inRange.push(target);
        }
      } else if (this.inRange.includes(target)) {
        this.inRange.splice(this.inRange.indexOf(target), 1);
      }
    }

    for (let i = this.inRange.length - 1; i >= 0; i--) {
      if (!this.world.entities.has(this.inRange[i].id!)) {
        this.inRange.splice(i, 1);
      }
    }
  }

  targets(): Entity[] {
    const out: Entity[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.type !== Types.Entities.SPACESHIP) {
        continue;
      }
      if (entity.id === this.world.localPlayerId) {
        continue;
      }
      out.push(entity);
    }
    return out;
  }

  isInRange(p1: Vector3, p2: Vector3, r: number): boolean {
    const t = p1.clone().sub(p2);
    return t.x * t.x + t.y * t.y + t.z * t.z < r * r;
  }
}
