import {System, Entity} from 'ecsy';
import {BoxGeometry, MeshBasicMaterial, Mesh, Vector3} from 'three';

import {Active} from '../components/active';
import {Object3d} from '../components/object3d';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Weapon} from '../components/weapon';
import {Timeout} from '../components/timeout';

export class WeaponSystem extends System {
  static queries: any = {
    weaponsActive: {
      components: [Weapon, Active]
    }
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

        const velocity = new Vector3(0, 0, 0.1).applyQuaternion(transform.rotation);

        this.world.createEntity()
          .addComponent(Object3d, {value: this.bulletMesh.clone()})
          .addComponent(Transform, {position, rotation})
          .addComponent(Physics, {velocity})
          .addComponent(Timeout, {
            timer: 500,
            removeComponents: [
              Physics,
              Transform,
              Object3d
            ]
          });
      }
    });
  }
}
