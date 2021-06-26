import { System } from 'ecsy';

import { WebGlRenderer } from '../components/webgl-renderer';
import { ParticleEffect } from '../components/particle-effect.js';
import { Transform } from '../components/transform';

import {
  InstancedMesh,
  DodecahedronBufferGeometry,
  MeshBasicMaterial,
  DynamicDrawUsage,
  Vector3,
  Object3D,
} from 'three';

export class ParticleSystem extends System {
  static queries = {
    renderers: {
      components: [WebGlRenderer],
      listen: { added: true }
    },
    particleEffects: {
      components: [ParticleEffect, Transform],
      listen: { added: true }
    },
  };

  init() {
    this.materials = {
      white: new MeshBasicMaterial({ color: 'white', transparent: true, opacity: 0.9, fog: true }),
      orange: new MeshBasicMaterial({ color: 'orange', transparent: true, opacity: 1, fog: true }),
    };

    const geometry = new DodecahedronBufferGeometry(3.2, 0);
    this.meshes = {
      dodecahedronWhite: new InstancedMesh(geometry, this.materials.white, 1000),
      dodecahedronOrange: new InstancedMesh(geometry, this.materials.orange, 1000),
    };

    Object.values(this.meshes).forEach((mesh) => {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.material.maxOpacity = mesh.material.opacity;
    });
  }

  execute() {
    this.queries.renderers.added.forEach((entity) => {
      const scene = entity.getComponent(WebGlRenderer).scene;
      Object.values(this.meshes).forEach((mesh) => {
        scene.add(mesh);
      });
    });

    this.queries.particleEffects.added.forEach((entity) => {
      const effect = entity.getMutableComponent(ParticleEffect);

      switch (effect.type) {
        case ParticleEffect.Types.Explosion:
          const whiteParticles = this.generateParticleBurst(40, 0.5);
          const orangeParticles = this.generateParticleBurst(40, 0.4);
          effect.particles.push(whiteParticles, orangeParticles);
          break;
      }
    });

    this.queries.particleEffects.results.forEach((entity) => {
      if (!entity.alive) return;

      const effect = entity.getMutableComponent(ParticleEffect);

      switch (effect.type) {
        case ParticleEffect.Types.Explosion:
          const position = entity.getComponent(Transform).position;
          const dummy = new Object3D();

          effect.particles.forEach((data, idx) => {
            const mesh = idx === 0 ? this.meshes.dodecahedronWhite : this.meshes.dodecahedronOrange;

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
            entity.remove();
            return;
          }

          effect.opacity -= 0.025;
          break;
      }
    });
  }

  generateParticleBurst(particleCount, maxSpeed) {
    return new Array(particleCount).fill(0).map(() => {
      return [
        new Vector3(),
        new Vector3(
          -1 + Math.random() * 2,
          -1 + Math.random() * 2,
          -1 + Math.random() * 2,
        ).normalize().multiplyScalar(maxSpeed)
      ];
    });
  }
}
