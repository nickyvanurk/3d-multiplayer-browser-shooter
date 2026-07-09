import {
  TextureLoader,
  SpriteMaterial,
  Sprite,
  OrthographicCamera,
  Scene,
} from 'three';
import type { Texture } from 'three';

import Types from '../../../shared/types.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { SceneManager } from './scene-manager.ts';
import type { ProjectionService } from './projection.ts';

// Ports hud-system.js: draws an off-screen indicator sprite for every non-player
// ship, clamped to an ellipse at the screen edge, swapping to a target reticle
// when the ship is on screen. Reads the 2D indicators produced by ProjectionService.
export class HudService {
  world: World;
  sceneManager: SceneManager;
  projection: ProjectionService;
  halfWidth: number;
  halfHeight: number;
  cameraOrtho: OrthographicCamera;
  sceneOrtho: Scene;
  textures?: {
    spaceship: Texture;
    target: Texture;
    vendor: Texture;
    targetVendor: Texture;
  };
  entityIndicators: Record<string, Sprite>;

  constructor(
    world: World,
    sceneManager: SceneManager,
    projection: ProjectionService,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.projection = projection;

    this.halfWidth = window.innerWidth / 2;
    this.halfHeight = window.innerHeight / 2;
    this.cameraOrtho = new OrthographicCamera(
      -this.halfWidth,
      this.halfWidth,
      this.halfHeight,
      -this.halfHeight,
      1,
      10,
    );
    this.cameraOrtho.position.z = 10;
    // Inert in the original JS: OrthographicCamera ignores fov. Cast preserves it verbatim.
    (this.cameraOrtho as OrthographicCamera & { fov: number }).fov = 70;
    this.sceneOrtho = new Scene();

    const loader = new TextureLoader();
    // The 2nd arg to Promise.all is dead code in the original JS (Promise.all takes one
    // arg); the cast keeps the exact call — including the ignored callback — unchanged.
    const texture = (
      Promise.all as (
        values: Texture[],
        executor: (resolve: (value: unknown) => void, reject: unknown) => void,
      ) => Promise<Texture[]>
    )(
      [
        loader.load('textures/spaceship.png'),
        loader.load('textures/target.png'),
        loader.load('textures/vendor.png'),
        loader.load('textures/target_vendor.png'),
      ],
      (resolve, _) => {
        resolve(texture);
      },
    ).then((result) => {
      this.textures = {
        spaceship: result[0],
        target: result[1],
        vendor: result[2],
        targetVendor: result[3],
      };
    });

    this.entityIndicators = {};

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  render(): void {
    if (!this.textures) {
      return;
    }

    const indicators = this.projection.indicators;

    for (const id of Object.keys(this.entityIndicators)) {
      if (!indicators.has(Number(id))) {
        this.sceneOrtho.remove(this.entityIndicators[id]);
        delete this.entityIndicators[id];
      }
    }

    for (const [id, transform2d] of indicators) {
      if (!this.entityIndicators[id]) {
        this.entityIndicators[id] = this.createHudSprite(0, 0);
      }

      const angle = transform2d.rotation;

      const a = this.halfWidth / 1.5;
      const b = this.halfHeight / 1.5;

      const t = Math.sqrt(
        (b * Math.cos(angle)) ** 2 + (a * Math.sin(angle)) ** 2,
      );
      const x = (a * b * Math.cos(angle)) / t;
      const y = (a * b * Math.sin(angle)) / t;

      const indicator = this.entityIndicators[id];

      const position = transform2d.position;

      // Same behaviour as ships (edge marker off-screen, reticle inside the
      // ellipse), but the vendor uses its own distinct icons for both states
      // (vendor marker / target_vendor reticle) so it never reads as an enemy.
      const isVendor =
        this.world.get(Number(id))?.type === Types.Entities.VENDOR;

      if (
        transform2d.onscreen &&
        position.x * position.x + position.y * position.y <= x * x + y * y
      ) {
        indicator.material = new SpriteMaterial({
          map: isVendor ? this.textures.targetVendor : this.textures.target,
        });
        indicator.position.set(
          transform2d.position.x,
          transform2d.position.y,
          1,
        );
      } else {
        indicator.material = new SpriteMaterial({
          map: isVendor ? this.textures.vendor : this.textures.spaceship,
        });
        indicator.position.set(x, y, 1);
      }
    }

    const renderer = this.sceneManager.renderer;
    renderer.clearDepth();
    renderer.render(this.sceneOrtho, this.cameraOrtho);
  }

  createHudSprite(x: number, y: number): Sprite {
    const material = new SpriteMaterial({ map: this.textures!.spaceship });
    const enemyIndicator = new Sprite(material);
    enemyIndicator.center.set(0.5, 0.5);
    enemyIndicator.position.set(x, y, 1); // top left
    const scale = 0.2;
    enemyIndicator.scale.set(
      material.map!.image.width * scale,
      material.map!.image.height * scale,
      1,
    );
    this.sceneOrtho.add(enemyIndicator);
    return enemyIndicator;
  }

  onWindowResize(): void {
    this.halfWidth = window.innerWidth / 2;
    this.halfHeight = window.innerHeight / 2;

    this.cameraOrtho.left = -this.halfWidth;
    this.cameraOrtho.right = this.halfWidth;
    this.cameraOrtho.top = this.halfHeight;
    this.cameraOrtho.bottom = -this.halfHeight;
    this.cameraOrtho.updateProjectionMatrix();

    this.sceneManager.renderer.setSize(this.halfWidth * 2, this.halfHeight * 2);
  }
}
