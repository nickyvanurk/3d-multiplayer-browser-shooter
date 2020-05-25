import {System, Entity} from 'ecsy';
import {BoxGeometry, MeshBasicMaterial, Mesh, Vector3} from 'three';

import {Gun} from '../components/gun';
import {Active} from '../components/active';
import {Object3d} from '../components/object3d';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {Weapon} from '../components/weapon';
import {Recovering} from '../components/recovering';
import { Timeout } from '../components/timeout';

export class WeaponSystem extends System {
  static queries: any = {
    weapons: {
      components: [Weapon]
    }
  };

  private bulletMesh: Mesh

  init() {
    const geometry = new BoxGeometry(0.1, 0.1, 0.5);
    const material = new MeshBasicMaterial( {color: 0xff0000} );
    this.bulletMesh = new Mesh(geometry, material);
  }

  execute(delta: number, time: number) {
    this.queries.weapons.results.forEach((weaponEntity: Entity) => {
      const weapon = weaponEntity.getComponent(Weapon).value;

      if (weapon.hasComponent(Active)) {
        if (weapon.hasComponent(Gun)) {
          const gun = weapon.getComponent(Gun);

          weapon.addComponent(Recovering)
            .addComponent(Timeout, {
              timer: gun.firingRate,
              removeComponents: [Recovering]
            });

          const parentTransform =  weaponEntity.getComponent(Transform);

          console.log(parentTransform.rotation);

          this.world.createEntity()
          .addComponent(Object3d, {value: this.bulletMesh.clone()})
          .addComponent(Transform, {
            position: parentTransform.position,
            rotation: parentTransform.renderRotation
          })
          .addComponent(Physics);
        }


        // this.world.createEntity()
        // .addComponent(Object3d, {value: this.bulletMesh.clone()})
        // .addComponent(Transform, {
        //   position
        // });
        // if (weapon.hasComponent(Gun)) {
        //   const gun = weapon.getMutableComponent(Gun);

        //   if (gun.lastFiredTimestamp + gun.firingRate < time)  {
        //     gun.lastFiredTimestamp = time;

        //     // console.log('Firing!');


        //   }
        // }
      }
    });
  }
}
