import { MeshBasicMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import Types from '../../../shared/types.js';

const MODEL_PATHS = {
  [Types.Entities.SPACESHIP]: 'fighter.glb',
  [Types.Entities.ASTEROID]: 'asteroid.glb',
  [Types.Entities.BULLET]: 'projectile.glb',
};

export class ViewRegistry {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.world = null;
    this.views = new Map();        // entity.id -> three.js Object3D
    this.models = new Map();       // entity.type -> gltf.scene
    this.ready = false;
    this.pendingSpawns = [];
    this.onShipDestroyed = null;   // (position) => void, wired by Task 19/20 particles
  }

  // Port of model-loading-system.js: load every kind's GLTF before views can be
  // created (mirrors the old Loaded/ResourceEntity gating). Resolves when ready.
  load() {
    const loader = new GLTFLoader().setPath('models/');

    const loads = Object.entries(MODEL_PATHS).map(([type, path]) => {
      const kind = Number(type);
      return new Promise((resolve, reject) => {
        loader.load(path, (gltf) => {
          if (kind === Types.Entities.BULLET) {
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                child.material = new MeshBasicMaterial({ color: 0xffa900 });
              }
            });
          }

          this.models.set(kind, gltf.scene);
          console.log(`Loaded model ${path}`);
          resolve();
        }, undefined, (error) => {
          console.error(`Failed loading model ${path}: ${error}`);
          reject(error);
        });
      });
    });

    return Promise.all(loads).then(() => {
      this.ready = true;
      for (const entity of this.pendingSpawns) {this.createView(entity);}
      this.pendingSpawns.length = 0;
    });
  }

  attachTo(world) {
    this.world = world;
    world.onSpawn = (entity) => this.handleSpawn(entity);
    world.onDespawn = (entity) => this.handleDespawn(entity);
  }

  handleSpawn(entity) {
    if (!this.ready) {
      this.pendingSpawns.push(entity);
      return;
    }
    this.createView(entity);
  }

  createView(entity) {
    const model = this.models.get(entity.type);

    if (!model) {
      console.error(`No model for entity type ${entity.type}`);
      return;
    }

    const mesh = model.clone();
    const { position, rotation, scale } = entity.transform;

    mesh.position.copy(position);
    mesh.quaternion.copy(rotation);
    mesh.scale.setScalar(scale);
    mesh.visible = true;

    this.scene.add(mesh);
    this.views.set(entity.id, mesh);
  }

  handleDespawn(entity) {
    const mesh = this.views.get(entity.id);

    if (mesh) {
      this.scene.remove(mesh);
      this.views.delete(entity.id);
    } else {
      const idx = this.pendingSpawns.indexOf(entity);
      if (idx !== -1) {this.pendingSpawns.splice(idx, 1);}
    }

    if (entity.type === Types.Entities.SPACESHIP) {
      this.onShipDestroyed?.(entity.transform.position.clone());
    }
  }

  // Port of webgl-renderer-system.js render() + transform-system.js: lerp
  // prevPosition->position and slerp prevRotation->rotation by alpha, write to mesh.
  update(alpha) {
    for (const [id, mesh] of this.views) {
      const entity = this.world.get(id);
      if (!entity) {continue;}

      const transform = entity.transform;

      const renderPosition = transform.position.clone()
        .multiplyScalar(alpha)
        .add(transform.prevPosition.clone().multiplyScalar(1 - alpha));
      const renderRotation = transform.prevRotation.clone()
        .slerp(transform.rotation, alpha);

      mesh.position.copy(renderPosition);
      mesh.quaternion.copy(renderRotation);
      mesh.scale.setScalar(transform.scale);
    }
  }
}
