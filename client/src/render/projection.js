import { Object3D, Vector2 } from 'three';

import Types from '../../../shared/types.js';

// Ports projection-system.js: projects each non-player ship's world position to
// screen space, producing a per-entity 2D indicator (pixel position, on-screen
// edge angle, and an onscreen flag). HUD and aim-assist read `this.indicators`.
// Each indicator is a plain record (position/rotation, onscreen flag) keyed by
// entity id.
export class ProjectionService {
  constructor(world, sceneManager) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.dummy = new Object3D();
    this.indicators = new Map(); // entity.id -> { position: Vector2, rotation, onscreen }
  }

  render() {
    const camera = this.sceneManager.camera;

    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;

    const live = new Set();

    for (const entity of this.world.entities.values()) {
      if (entity.type !== Types.Entities.SPACESHIP) {continue;}
      if (entity.id === this.world.localPlayerId) {continue;}

      live.add(entity.id);

      let indicator = this.indicators.get(entity.id);
      if (!indicator) {
        indicator = { position: new Vector2(), rotation: 0, onscreen: false };
        this.indicators.set(entity.id, indicator);
      }

      const transform = entity.transform;
      const projection = transform.position.clone().project(camera);

      indicator.position.x = projection.x * halfWidth;
      indicator.position.y = projection.y * halfHeight;

      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.position.copy(transform.position);
      this.dummy.applyMatrix4(camera.matrixWorldInverse);
      const localPosition = this.dummy.position;
      indicator.rotation = Math.atan2(localPosition.y, localPosition.x);

      indicator.onscreen = !(localPosition.z > 0 ||
        Math.abs(indicator.position.x) >= halfWidth ||
        Math.abs(indicator.position.y) >= halfHeight);
    }

    for (const id of this.indicators.keys()) {
      if (!live.has(id)) {this.indicators.delete(id);}
    }
  }
}
