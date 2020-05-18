import {System} from 'ecsy';
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import {Object3d} from '../components/object3d';
import {Transform} from '../components/transform';
import {NextFrameNormal} from '../components/next-frame-normal';
import {PlayerController} from '../components/player-controller';
import {Physics} from '../components/physics';

export class Render extends System {
  static queries: any = {
    object3d: {
      components: [Object3d, Transform],
      listen: {
        added: true
      }
    },
    nextFrameNormal: {
      components: [NextFrameNormal]
    },
    players: {
      components: [PlayerController, Transform]
    },
    object3dMoveable: {
      components: [Object3d, Transform, Physics]
    }
  };

  public queries: any;

  private scene: THREE.Scene;
  private camera: any;
  private renderer: THREE.WebGLRenderer;
  private composer: any;

  init() {
    const canvas = document.querySelector('canvas');
    this.renderer = new THREE.WebGLRenderer({canvas});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new THREE.Color('#020207'));
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020207, 0.02);
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.camera.position.z = -4;
    this.camera.position.y = 1;
    this.camera.rotation.y = Math.PI;

    var light: any = new THREE.DirectionalLight( 0xffffff );
    light.position.set(1, 1, 1);
    this.scene.add(light);

    var light: any = new THREE.DirectionalLight( 0x002288 );
    light.position.set(-1, -1, -1);
    this.scene.add(light);

    var light: any = new THREE.AmbientLight( 0x222222 );
    this.scene.add(light);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(undefined, 1.6, 1, 0));

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);
  }


  execute(delta: number) {
    this.queries.object3d.added.forEach((entity: any) => {
      this.scene.add(entity.getComponent(Object3d).value);
    });

    const nextFrameNormalEntity = this.queries.nextFrameNormal.results[0];
    const nextFrameNormal = nextFrameNormalEntity.getComponent(NextFrameNormal).value;

    this.queries.object3d.results.forEach((entity: any) => {
      const mesh = entity.getMutableComponent(Object3d).value;

      if (entity.hasComponent(Transform)) {
        const transform = entity.getComponent(Transform);

        if (entity.hasComponent(PlayerController)) {
          const physics = entity.getComponent(Physics);

          mesh.translateX(transform.translation.x + physics.velocity.x*(1000/60)*nextFrameNormal);
          mesh.translateY(transform.translation.y + physics.velocity.y*(1000/60)*nextFrameNormal);
          mesh.translateZ(transform.translation.z + physics.velocity.z*(1000/60)*nextFrameNormal);

          const q = new THREE.Quaternion(
            -transform.rotation.x,
            -transform.rotation.y,
            -transform.rotation.z,
            1
          ).normalize();
          mesh.quaternion.multiply(q);
          mesh.rotation.setFromQuaternion(mesh.quaternion, mesh.rotation.order);

          const obj = new THREE.Object3D();
          obj.position.copy(mesh.position);
          obj.quaternion.copy(mesh.quaternion);
          obj.translateY(1);
          obj.translateZ(-4);
          this.camera.position.lerp(obj.position, 1 - Math.exp(-20 * (delta/1000)));
          obj.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'XYZ')));
          this.camera.quaternion.slerp(obj.quaternion,  1 - Math.exp(-20 * (delta/1000)));
        } else {
          mesh.position.x = transform.position.x;
          mesh.position.y = transform.position.y;
          mesh.position.z = transform.position.z;

          mesh.rotation.x = transform.rotation.x;
          mesh.rotation.y = transform.rotation.y;
          mesh.rotation.z = transform.rotation.z;
        }
      }
    });

    this.composer.render();
  }
}
