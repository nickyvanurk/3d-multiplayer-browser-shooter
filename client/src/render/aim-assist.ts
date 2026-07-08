import { Vector3 } from 'three';

import type { World } from '../../../shared/sim/world.js';
import type { SceneManager } from './scene-manager.js';
import type { InputController } from '../input/input-controller.js';
import type { ProjectionService } from './projection.js';

// Ports aim-assist-system.js: when the cursor hovers near an on-screen ship, snap
// the aim ray distance to that ship's distance from the camera. Mutates the live
// input's `aim.distance` (the same object InputController.sample() returns), so the
// adjusted distance is sent with the next Messages.Input.
export class AimAssistService {
  world: World;
  sceneManager: SceneManager;
  inputController: InputController;
  projection: ProjectionService;
  lastVel: Vector3;

  constructor(
    world: World,
    sceneManager: SceneManager,
    inputController: InputController,
    projection: ProjectionService,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.inputController = inputController;
    this.projection = projection;
    this.lastVel = new Vector3();
  }

  update(): void {
    const camera = this.sceneManager.camera;
    const aim = this.inputController.input.aim;

    if (aim.distance !== aim.maxDistance) {
      aim.distance = aim.maxDistance;
    }

    const mouseInPixels = {
      x: aim.mouse.x * (window.innerWidth / 2),
      y: aim.mouse.x * (window.innerWidth / 2),
    };
    const targetRadius = 100; // px

    for (const [id, indicator] of this.projection.indicators) {
      if (!indicator.onscreen) {
        continue;
      }

      const entity = this.world.get(id);
      if (!entity) {
        continue;
      }

      const position = indicator.position;
      const mp = {
        x: mouseInPixels.x - position.x,
        y: mouseInPixels.y - position.y,
      };

      const distance = entity.transform.position
        .clone()
        .sub(camera.position)
        .length();
      const radius = Math.max(64, (targetRadius * 10) / distance);

      if (mp.x * mp.x + mp.y * mp.y < radius * radius) {
        aim.distance = entity.transform.position
          .clone()
          .sub(camera.position)
          .length();
      }
    }
  }
}
