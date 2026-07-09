import { Vector3 } from 'three';

import type { World } from '../../../shared/sim/world.ts';
import type { SceneManager } from './scene-manager.ts';
import type { InputController } from '../input/input-controller.ts';
import type { ProjectionService } from './projection.ts';

// Ports aim-assist-system.js: when the cursor hovers near an on-screen ship, snap
// the aim ray distance to that ship's distance from the camera. Mutates the live
// input's `aim.distance` (the same object InputController.sample() returns), so the
// adjusted distance feeds the owned ship's weapon aiming that same tick.
export class AimAssistService {
  world: World;
  sceneManager: SceneManager;
  inputController: InputController;
  projection: ProjectionService;
  lastVel: Vector3;
  // The enemy ship the crosshair is currently on (its lead ring or reticle), or
  // null. The HUD reads this to draw that ship's HP bar.
  aimedShipId: number | null;

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
    this.aimedShipId = null;
  }

  update(): void {
    const camera = this.sceneManager.camera;
    const aim = this.inputController.input.aim;

    this.aimedShipId = null;

    if (aim.distance !== aim.maxDistance) {
      aim.distance = aim.maxDistance;
    }

    // Cursor in centered pixels (y up), matching ProjectionService indicators.
    // Uses true NDC per axis — the old code read mouse.x for both axes and
    // scaled y by width, so the hover test never lined up with a target.
    const mouseInPixels = {
      x: aim.ndc.x * (window.innerWidth / 2),
      y: aim.ndc.y * (window.innerHeight / 2),
    };
    const targetRadius = 100; // px

    // Lead ring first: aiming at the "shoot here" marker of a moving target
    // should converge the guns at the LEAD point (ahead of the ship), not the
    // ship itself. This is where a moving target must actually be led, so it
    // takes priority over the reticle hover below.
    const leadHoverRadius = 48; // px around the fixed-size lead ring
    for (const [id, leadPos] of this.projection.leads) {
      const dx = mouseInPixels.x - leadPos.x;
      const dy = mouseInPixels.y - leadPos.y;
      if (dx * dx + dy * dy < leadHoverRadius * leadHoverRadius) {
        const leadDistance = this.projection.leadDistances.get(id);
        if (leadDistance !== undefined) {
          aim.distance = leadDistance;
          this.aimedShipId = id;
          return;
        }
      }
    }

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
        this.aimedShipId = id;
      }
    }
  }
}
