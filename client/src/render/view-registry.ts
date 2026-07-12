import { MeshBasicMaterial, Group, Box3, Color } from 'three';
import type {
  Object3D,
  Scene,
  Mesh,
  MeshStandardMaterial,
  BufferGeometry,
  Material,
  Vector3,
} from 'three';
import type { Ship } from '../../../shared/sim/entities/ship.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import Types from '../../../shared/types.ts';
import type { EntityKind } from '../../../shared/types.ts';
import { asteroidScale } from '../../../shared/sim/mining.ts';
import { decayError } from '../../../shared/sim/net/visual-smoothing.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { SceneManager } from './scene-manager.ts';
import { InstancedAsteroids } from './instanced-asteroids.ts';

const MODEL_PATHS: Record<EntityKind, string> = {
  [Types.Entities.SPACESHIP]: 'SM_Ship_Fighter_02.glb',
  [Types.Entities.ASTEROID]: 'asteroid.glb',
  [Types.Entities.BULLET]: 'projectile.glb',
  [Types.Entities.VENDOR]: 'SM_Ship_Transport_01.glb',
};

// The ship model carries a dedicated "Exhaust" material slot (black base, white
// emissive). Each ship view gets its own clone of it so the glow can be driven
// per-ship from thrust: emissive stays this colour and only the intensity is
// animated, so at intensity 0 the black base shows (engine off) and it flares
// toward orange/yellow as it climbs (bloom does the hot bloom-out).
const EXHAUST_MATERIAL_NAME = 'Exhaust';
// The glow is driven by what the pilot is pressing (not coasting speed): off at
// rest, orange on thrust/reverse, blue "afterburner" flame on boost. Intensity
// is kept low on purpose — pushing it high makes the orange clip through green
// and the bloom washes it out to yellow/white, so we hold near the projectile's
// own brightness to keep the colour reading true.
const EXHAUST_ORANGE = new Color(0xff5a00); // deep orange (less green = less yellow)
const EXHAUST_BLUE = new Color(0x2b6bff); // blue flame on boost
const EXHAUST_FORWARD_INTENSITY = 1.5; // holding W
const EXHAUST_BOOST_INTENSITY = 2.2; // W + boost
const EXHAUST_REVERSE_INTENSITY = 0.8; // holding S
// The glow brightness eases toward its target rather than snapping, so it spools
// up as the pilot accelerates and fades out fast on release. The colour, by
// contrast, is switched instantly (orange, or blue on boost). Units are
// intensity/second.
const EXHAUST_RAMP_UP = 4;
const EXHAUST_RAMP_DOWN = 9;

// Move `current` toward `target` by at most `step`, without overshooting.
function approach(current: number, target: number, step: number): number {
  return current < target
    ? Math.min(current + step, target)
    : Math.max(current - step, target);
}

export class ViewRegistry {
  sceneManager: SceneManager;
  scene: Scene;
  // All entity views are parented here (not directly to the scene) so the whole
  // world can be shown/hidden in one flip while the boot screen paints only the
  // background. See SceneManager.worldGroup.
  container: Group;
  world: World | null;
  views: Map<number, Object3D>;
  models: Map<number, Group>;
  ready: boolean;
  pendingSpawns: Entity[];
  onShipDestroyed: ((position: Vector3) => void) | null;
  // Fired as each kind's GLTF finishes loading, so the game can fill in state
  // that model gates but the renderer doesn't own (e.g. the vendor's physics
  // body, deferred until its deprioritized mesh streams in).
  onModelReady: ((kind: EntityKind) => void) | null;
  // The projectile model is a long beam whose pivot sits at its tail, so it would
  // be drawn extending forward past whatever it hits. Cache how far its tip leads
  // the pivot so bullet views can be shifted to put the tip at the origin.
  bulletTipOffset: number | null;
  // Shared red material for mining-laser tracers, so the beam reads as a distinct
  // red weapon (built lazily the first time a laser bullet is drawn).
  laserMaterial: MeshBasicMaterial | null;
  // Per-ship clone of the "Exhaust" material, keyed by entity id, whose emissive
  // intensity `update()` drives from that ship's thrust input.
  exhaustMaterials: Map<number, MeshStandardMaterial>;
  // The static asteroid field, rendered as a single instanced draw call instead
  // of one Object3D per rock. Built once the asteroid model has loaded.
  asteroids: InstancedAsteroids | null;
  // Last world render scale written for each asteroid, so the shrink loop only
  // rewrites an instance matrix when its ore-remaining actually changed.
  private asteroidScales: Map<number, number>;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.container = sceneManager.worldGroup;
    this.world = null;
    this.views = new Map(); // entity.id -> three.js Object3D
    this.models = new Map(); // entity.type -> gltf.scene
    this.ready = false;
    this.pendingSpawns = [];
    this.onShipDestroyed = null; // (position) => void, wired by Task 19/20 particles
    this.onModelReady = null;
    this.bulletTipOffset = null;
    this.laserMaterial = null;
    this.exhaustMaterials = new Map();
    this.asteroids = null;
    this.asteroidScales = new Map();
  }

  // Progressive GLTF load. Each kind is fetched independently and reveals its
  // own queued spawns the moment it lands (flushPending), so the world fills in
  // background -> asteroids -> ships as bytes arrive rather than all-or-nothing.
  // The returned promise resolves on the ESSENTIAL kinds (asteroid, ship); the
  // projectile then the heavy vendor mesh are deprioritized and streamed in
  // after, each filling in its view/body on arrival.
  load(): Promise<void> {
    const loader = new GLTFLoader().setPath('models/');

    const loadOne = (kind: EntityKind, path: string): Promise<void> =>
      new Promise<void>((resolve, reject) => {
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
            if (kind === Types.Entities.ASTEROID) {
              this.buildAsteroidField();
            }
            this.flushPending(kind);
            this.onModelReady?.(kind);
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

    // Only the ship + asteroid field are needed to spawn into a coherent sector,
    // so they alone gate the returned promise (and physics init) — getting in-game
    // waits for nothing else. The projectile mesh loads next (no bullets exist at
    // spawn; a shot fired in the first instant simply pops in when it lands), then
    // the far-away 2.3 MB vendor last. Each deprioritized kind fills in its
    // view/body when it arrives, and gets the full download pipe in turn.
    return Promise.all([
      loadOne(Types.Entities.ASTEROID, MODEL_PATHS[Types.Entities.ASTEROID]),
      loadOne(Types.Entities.SPACESHIP, MODEL_PATHS[Types.Entities.SPACESHIP]),
    ]).then(() => {
      this.ready = true;
      void loadOne(
        Types.Entities.BULLET,
        MODEL_PATHS[Types.Entities.BULLET],
      ).then(() =>
        loadOne(Types.Entities.VENDOR, MODEL_PATHS[Types.Entities.VENDOR]),
      );
    });
  }

  // Whether the mesh a given kind renders from is loaded yet. Asteroids draw
  // from the shared instanced field, which only exists once its model is in.
  hasModel(kind: EntityKind): boolean {
    if (kind === Types.Entities.ASTEROID) {
      return this.asteroids !== null;
    }
    return this.models.has(kind);
  }

  // Create views for any queued spawns whose model has now loaded, keeping the
  // rest queued. Called each time a kind's GLTF lands.
  private flushPending(_kind: EntityKind): void {
    if (this.pendingSpawns.length === 0) {
      return;
    }
    const remaining: Entity[] = [];
    for (const entity of this.pendingSpawns) {
      if (this.hasModel(entity.type)) {
        this.createView(entity);
      } else {
        remaining.push(entity);
      }
    }
    this.pendingSpawns = remaining;
  }

  // Extract the asteroid model's geometry + material into a single InstancedMesh.
  // The node transform is baked into the geometry so an instance matrix of just
  // the entity transform matches the old clone-the-whole-group render exactly.
  buildAsteroidField(): void {
    const model = this.models.get(Types.Entities.ASTEROID);
    if (!model) {
      return;
    }
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    const source = this.firstMesh(model);
    if (!source) {
      return;
    }

    const geometry = (source.geometry as BufferGeometry).clone();
    geometry.applyMatrix4(source.matrixWorld);
    const material: Material = Array.isArray(source.material)
      ? source.material[0]
      : source.material;

    this.asteroids = new InstancedAsteroids(this.container, geometry, material);
    this.asteroids.mesh.castShadow = false;
    this.asteroids.mesh.receiveShadow = true;
  }

  // First Mesh under `root`. The explicit return type is deliberate: it stops
  // TS narrowing the closure-assigned local to `null` at the call site.
  firstMesh(root: Object3D): Mesh | null {
    let found: Mesh | null = null;
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh && !found) {
        found = mesh;
      }
    });
    return found;
  }

  attachTo(world: World): void {
    this.world = world;
    world.onSpawn = (entity) => this.handleSpawn(entity);
    world.onDespawn = (entity) => this.handleDespawn(entity);
  }

  handleSpawn(entity: Entity): void {
    if (!this.hasModel(entity.type)) {
      this.pendingSpawns.push(entity);
      return;
    }
    this.createView(entity);
  }

  createView(entity: Entity): void {
    // Asteroids live in the shared instanced field, not as individual views.
    if (entity.type === Types.Entities.ASTEROID) {
      this.asteroids?.add(entity.id!, entity.transform);
      return;
    }

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

    this.container.add(view);
    this.views.set(entity.id!, view);

    if (
      entity.type === Types.Entities.SPACESHIP ||
      entity.type === Types.Entities.VENDOR
    ) {
      const exhaust = this.prepareExhaust(view);
      if (exhaust) {
        this.exhaustMaterials.set(entity.id!, exhaust);
      }
    }
  }

  // Give this ship view its own clone of the shared "Exhaust" material (so its
  // glow animates independently), recolour it, and start it dark. Returns the
  // per-ship material `update()` drives, or null if the model has no such slot.
  prepareExhaust(view: Object3D): MeshStandardMaterial | null {
    let exhaust: MeshStandardMaterial | null = null;
    view.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (let i = 0; i < materials.length; i++) {
        if (materials[i].name !== EXHAUST_MATERIAL_NAME) {
          continue;
        }
        if (!exhaust) {
          const cloned = materials[i].clone() as MeshStandardMaterial;
          cloned.emissive = EXHAUST_ORANGE.clone();
          cloned.emissiveIntensity = 0;
          exhaust = cloned;
        }
        const material = exhaust as MeshStandardMaterial;
        if (Array.isArray(mesh.material)) {
          mesh.material[i] = material;
        } else {
          mesh.material = material;
        }
      }
    });
    return exhaust;
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

    // Mining-laser tracers carry a miningFactor; paint their (shared-material)
    // clone red so the mining beam is visually distinct from the orange cannons.
    if ((entity as { miningFactor?: number }).miningFactor) {
      if (!this.laserMaterial) {
        this.laserMaterial = new MeshBasicMaterial({ color: 0xff2b2b });
      }
      mesh.traverse((child) => {
        if ((child as Mesh).isMesh) {
          (child as Mesh).material = this.laserMaterial!;
        }
      });
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
    if (entity.type === Types.Entities.ASTEROID) {
      this.asteroids?.remove(entity.id!);
      this.asteroidScales.delete(entity.id!);
      const idx = this.pendingSpawns.indexOf(entity);
      if (idx !== -1) {
        this.pendingSpawns.splice(idx, 1);
      }
      return;
    }

    const mesh = this.views.get(entity.id!);

    if (mesh) {
      this.container.remove(mesh);
      this.views.delete(entity.id!);
      this.exhaustMaterials.delete(entity.id!);
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
  update(alpha: number, delta = 0): void {
    const dt = delta / 1000;
    for (const [id, mesh] of this.views) {
      const entity = this.world!.get(id);
      if (!entity) {
        continue;
      }

      const transform = entity.transform;

      // Interpolate prev -> current directly into the mesh's own vectors. No
      // per-entity/per-frame allocations (was 3 clones each). Only moving
      // entities (ships, bullets) reach here; the static asteroid field is an
      // instanced mesh whose matrices are set once on spawn.
      // Interpolated authoritative pose, plus the Fiedler visual-smoothing error
      // offset (zero for entities that never accumulate one, e.g. bullets).
      mesh.position
        .copy(transform.prevPosition)
        .lerp(transform.position, alpha)
        .add(transform.errorPosition);
      mesh.quaternion
        .copy(transform.prevRotation)
        .slerp(transform.rotation, alpha)
        .multiply(transform.errorRotation);
      mesh.scale.setScalar(transform.scale);

      // Decay the render error toward zero so the last correction glides out.
      decayError(transform.errorPosition, transform.errorRotation, delta);

      const exhaust = this.exhaustMaterials.get(id);
      if (exhaust) {
        this.driveExhaust(entity, exhaust, dt);
      }
    }

    this.updateAsteroidShrink();
  }

  // Shrink each asteroid instance toward its ore-remaining. oreRemaining rides
  // the health slot from the server; the field is otherwise static, so a matrix
  // is only rewritten when a rock's rendered scale actually changed.
  private updateAsteroidShrink(): void {
    if (!this.asteroids || !this.world) {
      return;
    }
    for (const entity of this.world.entities.values()) {
      if (entity.type !== Types.Entities.ASTEROID) {
        continue;
      }
      const ore = entity as unknown as { health: number; maxOre: number };
      const target = asteroidScale(
        entity.transform.scale,
        ore.health,
        ore.maxOre,
      );
      const prev = this.asteroidScales.get(entity.id!);
      if (prev !== undefined && Math.abs(prev - target) < 1e-3) {
        continue;
      }
      this.asteroids.setScale(entity.id!, entity.transform, target);
      this.asteroidScales.set(entity.id!, target);
    }
  }

  // Light the exhaust from thrust INPUT, not motion: it glows while the pilot
  // holds W (brighter on boost) and dimmer on S. The colour is switched
  // instantly (blue on boost, orange otherwise); only the brightness eases,
  // spooling up as you accelerate and fading out fast on release. The owned ship
  // reads its live controller input; remote ships read the input replicated from
  // the server (decoded into renderInput by NetworkClient).
  driveExhaust(
    entity: Entity,
    exhaust: MeshStandardMaterial,
    dt: number,
  ): void {
    const ship = entity as Ship;
    const input = ship.controller?.lastInput ?? ship.renderInput;

    let target = 0;
    let color = EXHAUST_ORANGE;
    if (input?.forward) {
      if (input.boost) {
        target = EXHAUST_BOOST_INTENSITY;
        color = EXHAUST_BLUE;
      } else {
        target = EXHAUST_FORWARD_INTENSITY;
      }
    } else if (input?.backward) {
      target = EXHAUST_REVERSE_INTENSITY;
    }

    exhaust.emissive.copy(color);

    const current = exhaust.emissiveIntensity;
    const rate = (target > current ? EXHAUST_RAMP_UP : EXHAUST_RAMP_DOWN) * dt;
    exhaust.emissiveIntensity = approach(current, target, rate);
  }
}
