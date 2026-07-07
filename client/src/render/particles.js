import {
  InstancedMesh,
  DodecahedronBufferGeometry,
  MeshBasicMaterial,
  DynamicDrawUsage,
  Vector3,
  Object3D,
} from 'three';

// Ports particle-system.js: instanced dodecahedron explosion bursts that fade out.
// The old system spawned a ParticleEffect entity on ship death; here ViewRegistry's
// onShipDestroyed calls spawnExplosion(position) directly.
export class ParticleService {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;

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
      this.sceneManager.scene.add(mesh);
    });

    this.effects = [];
  }

  spawnExplosion(position) {
    const whiteParticles = this.generateParticleBurst(40, 0.5);
    const orangeParticles = this.generateParticleBurst(40, 0.4);
    this.effects.push({
      opacity: 1,
      particles: [whiteParticles, orangeParticles],
      position: position.clone(),
    });
  }

  update() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      const position = effect.position;
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
        this.effects.splice(i, 1);
        continue;
      }

      effect.opacity -= 0.025;
    }
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
