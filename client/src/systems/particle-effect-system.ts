import {System, Entity} from 'ecsy';
import {Scene} from '../components/scene';
import {ParticleEffect} from '../components/particle-effect';
import {Transform} from '../components/transform';
import {ParticleEffectType} from '../components/particle-effect';
import {Destroy} from '../components/destroy';
import {Screenshake} from '../components/screenshake';

import {
  InstancedMesh as InstancedMesh$1,
  DodecahedronBufferGeometry,
  MeshBasicMaterial,
  DynamicDrawUsage,
  Vector3,
  Object3D,
} from 'three';

export class ParticleEffectSystem extends System {
  static queries: any = {
    scene: {
      components: [Scene],
      listen: {
        added: true
      }
    },
    particleEffects: {
      components: [ParticleEffect, Transform],
      listen: {
        added: true
      }
    }
  };

  private materials: Array<object>;
  private meshes: Array<InstancedMesh$1>;
  private particles: any;

  init() {
    const whiteMaterial = new MeshBasicMaterial({
      color: 'white',
      transparent: true,
      opacity: 0.9,
      fog: true
    });

    const orangeMaterial = new MeshBasicMaterial({
      color: 'orange',
      transparent: true,
      opacity: 1,
      fog: true
    });

    this.materials = [whiteMaterial.clone(), orangeMaterial.clone()];

    const geometry = new DodecahedronBufferGeometry(0.8, 0);

    this.meshes = [
      new InstancedMesh$1(geometry, whiteMaterial, 1000),
      new InstancedMesh$1(geometry, orangeMaterial, 1000)
    ];

    this.meshes.forEach((mesh: InstancedMesh$1) => {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    });
  }

  execute() {
    this.queries.scene.added.forEach((entity: Entity) => {
      this.meshes.forEach((mesh: InstancedMesh$1) => {
        entity.getComponent(Scene).value.add(mesh);
      });
    })

    this.queries.particleEffects.added.forEach((entity: Entity) => {
      const type = entity.getComponent(ParticleEffect).type;

      if (type !== ParticleEffectType.Explosion) {
        return;
      }

      let speed = 0.15;
      const whiteParticles = new Array(40).fill(0).map(() => {
        return [
          new Vector3(),
          new Vector3(
            -1 + Math.random() * 2,
            -1 + Math.random() * 2,
            -1 + Math.random() * 2
          ).normalize().multiplyScalar(speed * 0.75)
        ];
      });

      speed = 0.1;
      const orangeParticles = new Array(40).fill(0).map(() => {
        return [
          new Vector3(),
          new Vector3(
            -1 + Math.random() * 2,
            -1 + Math.random() * 2,
            -1 + Math.random() * 2
          ).normalize().multiplyScalar(speed * 0.75)
        ];
      });

      this.particles = [whiteParticles, orangeParticles];

      this.meshes.forEach((mesh: InstancedMesh$1, i: number) => {
        // @ts-ignore
        mesh.material.opacity = this.materials[i].opacity;
      });

      this.world.createEntity()
        .addComponent(Transform, {
          position: entity.getComponent(Transform).position.clone()
        })
        .addComponent(Screenshake, {
        strength: 1,
        damping: 0.05,
        distance: 60
      });
    });

    this.queries.particleEffects.results.forEach((entity: Entity) => {
      const type = entity.getComponent(ParticleEffect).type;

      if (type !== ParticleEffectType.Explosion) {
        return;
      }

      const effectPosition = entity.getComponent(Transform).position;
      const dummy = new Object3D();

      this.particles.forEach((data: Array<Vector3>, type: number) => {
        const mesh = this.meshes[type];

        data.forEach(([position, velocity]: any, i: number) => {
          position.add(velocity);
          dummy.position.copy(position);
          dummy.position.add(effectPosition);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });

        // @ts-ignore
        mesh.material.opacity -= 0.025;
        mesh.instanceMatrix.needsUpdate = true;
      });

      let highestOpacity = 0;
      this.meshes.forEach((mesh: InstancedMesh$1) => {
        // @ts-ignore
        if (mesh.material.opacity > highestOpacity) {
          // @ts-ignore
          highestOpacity = mesh.material.opacity;
        }
      });

      if (highestOpacity === 0) {
        entity.addComponent(Destroy);
      }
    });
  }
}
