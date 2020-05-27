import {System, Entity} from 'ecsy';
import {BoxGeometry, MeshBasicMaterial, Mesh, Vector3, Matrix4} from 'three';

import {Active} from '../components/active';
import {Object3d} from '../components/object3d';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Weapon} from '../components/weapon';
import {Timeout} from '../components/timeout';
import {Camera} from '../components/camera';
import {Raycaster} from '../components/raycaster';
import {Destroy} from '../components/destroy';
import {SphereCollider} from '../components/sphere-collider';
import {DestroyOnCollision} from '../components/destroy-on-collision';
import {Owner} from '../components/owner';

export class WeaponSystem extends System {
  static queries: any = {
    weaponsActive: {
      components: [Weapon, Active]
    },
    cameraRaycaster: {
      components: [Camera, Raycaster],
      listen: {
        added: true
      }
    },
  };

  private bulletMesh: Mesh

  init() {
    const geometry = new BoxGeometry(0.1, 0.1, 1);
    const material = new MeshBasicMaterial( {color: 0xffa900} );
    this.bulletMesh = new Mesh(geometry, material);
  }

  execute(delta: number, time: number) {
    this.queries.weaponsActive.results.forEach((weaponEntity: Entity) => {
      const weapon: Weapon = weaponEntity.getComponent(Weapon);
      const transform = weaponEntity.getComponent(Transform);

      if (weapon.lastFiredTimestamp + weapon.fireInterval < time) {
        weapon.lastFiredTimestamp = time;

        let position = new Vector3().copy(weapon.offset)
          .applyQuaternion(transform.rotation)
          .add(transform.position);
        let rotation = transform.rotation;

        if (weapon.parent) {
          const parentTransform = weapon.parent.getComponent(Transform);

          position = new Vector3().copy(weapon.offset)
            .applyQuaternion(parentTransform.rotation)
            .add(parentTransform.position);
          rotation.copy(parentTransform.rotation)
        }

        const raycaster = this.queries.cameraRaycaster.results[0].getComponent(Raycaster);

        let targetPosition = new Vector3();

        if (raycaster.intersection) {
          targetPosition = raycaster.intersection.point;
        } else {
          raycaster.value.ray.at(0.1*60*0.5*16, targetPosition); //speed*fps*0.5sec*physicsDelta
        }

        const targetDirection = new Vector3();
        targetDirection.subVectors(targetPosition, position).normalize();

        var mx = new Matrix4().lookAt(targetDirection, new Vector3(), new Vector3(0, 1, 0));
        rotation = rotation.setFromRotationMatrix(mx);

        const velocity = targetDirection.setLength(0.1);

        const projectile = this.world.createEntity()
          .addComponent(Object3d, {value: this.bulletMesh.clone()})
          .addComponent(Transform, {position, rotation})
          .addComponent(Physics, {velocity})
          .addComponent(SphereCollider, {isTrigger: true, radius: 0.1})
          .addComponent(DestroyOnCollision)
          .addComponent(Timeout, {
            timer: 500,
            addComponents: [Destroy]
          });

        if (weapon.parent) {
          projectile.addComponent(Owner, {value: weapon.parent});
        }
      }
    });
  }
}
