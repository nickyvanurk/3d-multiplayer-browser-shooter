import {
  InstancedMesh,
  DodecahedronBufferGeometry,
  MeshBasicMaterial,
  DynamicDrawUsage,
  Vector3,
  Object3D,
  TextureLoader,
  Sprite,
  SpriteMaterial,
  AdditiveBlending,
} from 'three';
import type { Texture } from 'three';

import type { SceneManager } from './scene-manager.ts';

// A short dust puff (SpaceDust.png) that expands and fades, masking the "pop"
// when an asteroid's render scale snaps to a new ore level. `size` scales with
// the rock so a big asteroid throws a bigger cloud.
interface DustPuff {
  sprite: Sprite;
  age: number;
  life: number;
  size: number;
}
const DUST_LIFE_MS = 550;

// A MeshBasicMaterial carrying the extra `maxOpacity` field the fade uses.
type FadingMaterial = MeshBasicMaterial & { maxOpacity: number };
type ParticleMesh = InstancedMesh<DodecahedronBufferGeometry, FadingMaterial>;

interface Effect {
  opacity: number;
  particles: [Vector3, Vector3][][];
  position: Vector3;
}

// Ports particle-system.js: instanced dodecahedron explosion bursts that fade out.
// The old system spawned a ParticleEffect entity on ship death; here ViewRegistry's
// onShipDestroyed calls spawnExplosion(position) directly.
export class ParticleService {
  sceneManager: SceneManager;
  materials: { white: FadingMaterial; orange: FadingMaterial };
  meshes: { dodecahedronWhite: ParticleMesh; dodecahedronOrange: ParticleMesh };
  effects: Effect[];
  dustTexture: Texture;
  dustPuffs: DustPuff[];

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.dustTexture = new TextureLoader().load('textures/SpaceDust.png');
    this.dustPuffs = [];

    this.materials = {
      white: new MeshBasicMaterial({
        color: 'white',
        transparent: true,
        opacity: 0.9,
        fog: true,
      }) as FadingMaterial,
      orange: new MeshBasicMaterial({
        color: 'orange',
        transparent: true,
        opacity: 1,
        fog: true,
      }) as FadingMaterial,
    };

    const geometry = new DodecahedronBufferGeometry(3.2, 0);
    this.meshes = {
      dodecahedronWhite: new InstancedMesh(
        geometry,
        this.materials.white,
        1000,
      ),
      dodecahedronOrange: new InstancedMesh(
        geometry,
        this.materials.orange,
        1000,
      ),
    };

    Object.values(this.meshes).forEach((mesh) => {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.material.maxOpacity = mesh.material.opacity;
      this.sceneManager.scene.add(mesh);
    });

    this.effects = [];
  }

  // A dust puff at `position`; `size` is the cloud's peak world radius (scale it
  // with the asteroid so big rocks throw bigger clouds).
  spawnDust(position: Vector3, size: number): void {
    const material = new SpriteMaterial({
      map: this.dustTexture,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
    });
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(size * 0.4);
    this.sceneManager.scene.add(sprite);
    this.dustPuffs.push({ sprite, age: 0, life: DUST_LIFE_MS, size });
  }

  private updateDust(delta: number): void {
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const puff = this.dustPuffs[i];
      puff.age += delta;
      const t = puff.age / puff.life;
      if (t >= 1) {
        this.sceneManager.scene.remove(puff.sprite);
        puff.sprite.material.dispose();
        this.dustPuffs.splice(i, 1);
        continue;
      }
      // Expand quickly and fade out over the puff's life.
      puff.sprite.scale.setScalar(puff.size * (0.4 + t));
      puff.sprite.material.opacity = 0.7 * (1 - t);
    }
  }

  spawnExplosion(position: Vector3): void {
    const whiteParticles = this.generateParticleBurst(40, 0.5);
    const orangeParticles = this.generateParticleBurst(40, 0.4);
    this.effects.push({
      opacity: 1,
      particles: [whiteParticles, orangeParticles],
      position: position.clone(),
    });
  }

  update(delta = 16): void {
    this.updateDust(delta);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      const position = effect.position;
      const dummy = new Object3D();

      effect.particles.forEach((data, idx) => {
        const mesh =
          idx === 0
            ? this.meshes.dodecahedronWhite
            : this.meshes.dodecahedronOrange;

        data.forEach(([pos, velocity], idx) => {
          pos.add(velocity);
          dummy.position.copy(pos);
          dummy.position.add(position);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
        });

        mesh.material.opacity = mesh.material.maxOpacity - (1 - effect.opacity);
        mesh.instanceMatrix.needsUpdate = true;
      });

      if (effect.opacity <= 0) {
        this.effects.splice(i, 1);
        continue;
      }

      effect.opacity -= 0.025;
    }
  }

  generateParticleBurst(
    particleCount: number,
    maxSpeed: number,
  ): [Vector3, Vector3][] {
    return new Array(particleCount).fill(0).map((): [Vector3, Vector3] => {
      return [
        new Vector3(),
        new Vector3(
          -1 + Math.random() * 2,
          -1 + Math.random() * 2,
          -1 + Math.random() * 2,
        )
          .normalize()
          .multiplyScalar(maxSpeed),
      ];
    });
  }
}
