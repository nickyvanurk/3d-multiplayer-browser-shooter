import {System} from 'ecsy';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls'
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import {Object3d} from '../components/object3d';
import {Position} from '../components/position';
import {Rotation} from '../components/rotation';
import {NextFrameNormal} from '../components/next-frame-normal';

export class Render extends System {
  static queries: any = {
    object3d: {
      components: [Object3d],
      listen: {
        added: true
      }
    },
    nextFrameNormal: {
      components: [NextFrameNormal]
    }
  };

  public queries: any;

  private scene: THREE.Scene;
  private camera: any;
  private controls: any;
  private renderer: THREE.WebGLRenderer;
  private composer: any

  init() {
    const canvas = document.querySelector('canvas');
    this.renderer = new THREE.WebGLRenderer({canvas});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new THREE.Color('#020207'));
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020207, 0.02);
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxDistance = 15;
    this.controls.enablePan = false;
    this.controls.mouseButtons = {RIGHT: THREE.MOUSE.ROTATE};

    this.camera.position.z = 5;
    this.controls.update();

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
  }

  execute(delta: number) {
    this.controls.update();

    this.queries.object3d.added.forEach((entity: any) => {
      this.scene.add(entity.getComponent(Object3d).value);
    });

    this.queries.object3d.results.forEach((entity: any) => {
      const mesh = entity.getMutableComponent(Object3d).value;

      if (entity.hasComponent(Position)) {
        const position = entity.getComponent(Position);

        mesh.position.x = position.x;
        mesh.position.y = position.y;
        mesh.position.z = position.z;
      }

      if (entity.hasComponent(Rotation)) {
        const rotation = entity.getComponent(Rotation);

        mesh.rotation.x = rotation.x;
        mesh.rotation.y = rotation.y;
        mesh.rotation.z = rotation.z;
      }
    });

    this.composer.render();
  }
}
