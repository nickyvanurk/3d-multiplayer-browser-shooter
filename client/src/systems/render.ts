import {System} from 'ecsy';
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import {Object3d} from '../components/object3d';
import {Transform} from '../components/transform';
import {Camera} from '../components/camera';

export class Render extends System {
  static queries: any = {
    object3d: {
      components: [Object3d, Transform],
      listen: {
        added: true
      }
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
    this.scene.fog = new THREE.Fog(0x020207, 0.04);
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );

    this.renderStars();

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
      .addComponent(Transform)
      .addComponent(Camera);
  }

  execute(delta: number) {
    this.queries.object3d.added.forEach((entity: any) => {
      this.scene.add(entity.getComponent(Object3d).value);
    });

    this.queries.object3d.results.forEach((entity: any) => {
      const mesh = entity.getMutableComponent(Object3d).value;

      if (entity.hasComponent(Transform)) {
        const transform = entity.getComponent(Transform);

        mesh.position.x = transform.renderPosition.x;
        mesh.position.y = transform.renderPosition.y;
        mesh.position.z = transform.renderPosition.z;

        mesh.quaternion.copy(transform.renderRotation);
      }
    });

    this.queries.camera.results.forEach((entity: any) => {
      const transform = entity.getComponent(Transform);
      this.camera.position.copy(transform.renderPosition);
      this.camera.quaternion.copy(transform.renderRotation);
    });

    this.composer.render();
  }

  renderStars(amount: number = 2000) {
    const positions = []
    for (let i = 0; i < amount; i++) {
      const r = 4000
      const theta = 2 * Math.PI * Math.random()
      const phi = Math.acos(2 * Math.random() - 1)
      const x = r * Math.cos(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000)
      const y = r * Math.sin(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000)
      const z = r * Math.cos(phi) + (-1000 + Math.random() * 2000)
      positions.push(x)
      positions.push(y)
      positions.push(z)
    }

    var geometry = new THREE.BufferGeometry();
    var vertices = new Float32Array(positions);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    var material = new THREE.PointsMaterial({color: 0xffffff, size: 12.5, fog: false});
    var mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);
  }
}
