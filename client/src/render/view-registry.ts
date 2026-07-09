import { MeshBasicMaterial, Group, Box3 } from 'three';
import type { Object3D, Scene, Vector3, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import Types from '../../../shared/types.ts';
import type { EntityKind } from '../../../shared/types.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { SceneManager } from './scene-manager.ts';

const MODEL_PATHS: Record<EntityKind, string> = {
  [Types.Entities.SPACESHIP]: 'fighter.glb',
  [Types.Entities.ASTEROID]: 'asteroid.glb',
  [Types.Entities.BULLET]: 'projectile.glb',
};

export class ViewRegistry {
  sceneManager: SceneManager;
  scene: Scene;
  world: World | null;
  views: Map<number, Object3D>;
  models: Map<number, Group>;
  ready: boolean;
  pendingSpawns: Entity[];
  onShipDestroyed: ((position: Vector3) => void) | null;
  // The projectile model is a long beam whose pivot sits at its tail, so it would
  // be drawn extending forward past whatever it hits. Cache how far its tip leads
  // the pivot so bullet views can be shifted to put the tip at the origin.
  bulletTipOffset: number | null;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.world = null;
    this.views = new Map(); // entity.id -> three.js Object3D
    this.models = new Map(); // entity.type -> gltf.scene
    this.ready = false;
    this.pendingSpawns = [];
    this.onShipDestroyed = null; // (position) => void, wired by Task 19/20 particles
    this.bulletTipOffset = null;
  }

  // Port of model-loading-system.js: load every kind's GLTF before views can be
  // created (mirrors the old Loaded/ResourceEntity gating). Resolves when ready.
  load(): Promise<void> {
    const loader = new GLTFLoader().setPath('models/');

    const loads = Object.entries(MODEL_PATHS).map(([type, path]) => {
      const kind = Number(type);
      return new Promise<void>((resolve, reject) => {
        loader.load(
          path,
          (gltf) => {
            if (kind === Types.Entities.BULLET) {
              gltf.scene.traverse((child) => {
                if ((child as Mesh).isMesh) {
                  (child as Mesh).material = new MeshBasicMaterial({
                    color: 0xffa900,
                  });
                }
              });
            }

            this.models.set(kind, gltf.scene);
            console.log(`Loaded model ${path}`);
            resolve();
          },
          undefined,
          (error) => {
            console.error(`Failed loading model ${path}: ${error}`);
            reject(error);
          },
        );
      });
    });

    return Promise.all(loads).then(() => {
      this.ready = true;
      for (const entity of this.pendingSpawns) {
        this.createView(entity);
      }
      this.pendingSpawns.length = 0;
    });
  }

  attachTo(world: World): void {
    this.world = world;
    world.onSpawn = (entity) => this.handleSpawn(entity);
    world.onDespawn = (entity) => this.handleDespawn(entity);
  }

  handleSpawn(entity: Entity): void {
    if (!this.ready) {
      this.pendingSpawns.push(entity);
      return;
    }
    this.createView(entity);
  }

  createView(entity: Entity): void {
    const model = this.models.get(entity.type);

    if (!model) {
      console.error(`No model for entity type ${entity.type}`);
      return;
    }

    const view = this.buildMesh(entity, model);
    const { position, rotation, scale } = entity.transform;

    view.position.copy(position);
    view.quaternion.copy(rotation);
    view.scale.setScalar(scale);
    view.visible = true;

    this.scene.add(view);
    this.views.set(entity.id!, view);
  }

  // The transform (position/rotation) is the projectile's leading point — it is
  // what the hit raycast originates from. The beam model's pivot is at its tail,
  // so left as-is it would render extending forward through the target. Wrap it
  // and shift it back by its tip offset so the tip sits at the view origin; the
  // beam then trails behind the impact point instead of poking past it.
  buildMesh(entity: Entity, model: Group): Object3D {
    const mesh = model.clone();
    if (entity.type !== Types.Entities.BULLET) {
      return mesh;
    }

    if (this.bulletTipOffset === null) {
      this.bulletTipOffset = new Box3().setFromObject(model).max.z;
    }

    const group = new Group();
    mesh.position.z = -this.bulletTipOffset;
    group.add(mesh);
    return group;
  }

  handleDespawn(entity: Entity): void {
    const mesh = this.views.get(entity.id!);

    if (mesh) {
      this.scene.remove(mesh);
      this.views.delete(entity.id!);
    } else {
      const idx = this.pendingSpawns.indexOf(entity);
      if (idx !== -1) {
        this.pendingSpawns.splice(idx, 1);
      }
    }

    if (entity.type === Types.Entities.SPACESHIP) {
      this.onShipDestroyed?.(entity.transform.position.clone());
    }
  }

  // Port of webgl-renderer-system.js render() + transform-system.js: lerp
  // prevPosition->position and slerp prevRotation->rotation by alpha, write to mesh.
  update(alpha: number): void {
    for (const [id, mesh] of this.views) {
      const entity = this.world!.get(id);
      if (!entity) {
        continue;
      }

      const transform = entity.transform;

      // Interpolate prev -> current directly into the mesh's own vectors. No
      // per-entity/per-frame allocations (was 3 clones each) — with hundreds of
      // asteroids the old path churned ~90k temp objects/sec, causing periodic
      // GC hitches.
      mesh.position
        .copy(transform.prevPosition)
        .lerp(transform.position, alpha);
      mesh.quaternion
        .copy(transform.prevRotation)
        .slerp(transform.rotation, alpha);
      mesh.scale.setScalar(transform.scale);
    }
  }
}
