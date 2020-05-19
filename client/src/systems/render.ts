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
import {Camera} from '../components/camera';
import {PlayerInputState} from '../components/player-input-state';
import { Vector3 } from 'three';

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
    },
    camera: {
      components: [Object3d, Camera]
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

    this.world.createEntity()
      .addComponent(Object3d, {value: new THREE.Object3D()})
      .addComponent(Camera);
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

        mesh.position.x = transform.position.x;
        mesh.position.y = transform.position.y;
        mesh.position.z = transform.position.z;

        mesh.rotation.x = transform.rotation.x;
        mesh.rotation.y = transform.rotation.y;
        mesh.rotation.z = transform.rotation.z;

        if (entity.hasComponent(PlayerController)) {
          const physics = entity.getComponent(Physics);

          mesh.position.x += physics.velocity.x*nextFrameNormal;
          mesh.position.y += physics.velocity.y*nextFrameNormal;
          mesh.position.z += physics.velocity.z*nextFrameNormal;

          this.queries.camera.results.forEach((entity: any) => {
            const mesh = entity.getComponent(Object3d).value;

            const position = new THREE.Vector3().copy(mesh.position);

            position.x += physics.velocity.x*nextFrameNormal;
            position.y += physics.velocity.y*nextFrameNormal;
            position.z += physics.velocity.z*nextFrameNormal;

            this.camera.position.copy(position);
            this.camera.quaternion.copy(mesh.quaternion);
          })
        } else {
          mesh.rotation.x += 0.001*(1000/60)*nextFrameNormal;
          mesh.rotation.y += 0.001*(1000/60)*nextFrameNormal;
        }
      }
    });

    this.composer.render();
  }
}
