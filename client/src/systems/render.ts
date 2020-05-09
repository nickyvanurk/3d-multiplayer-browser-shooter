import {System} from 'ecsy';
import * as THREE from 'three';
import Position from '../components/position';
import Renderable from '../components/renderable';
import Shape from '../components/shape';

export class Render extends System {
  static queries = {
    renderables: { components: [Renderable, Shape, Position] }
  };

  public queries: any;

  private scene: THREE.Scene;
  private camera: any;
  private renderer: THREE.WebGLRenderer;
  private cube: THREE.Mesh;

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
    this.scene.fog = new THREE.Fog(0x020207, 100, 700);
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.camera.position.z = 5;

    var geometry = new THREE.BoxGeometry();
    var material = new THREE.MeshBasicMaterial({color: 0x00ff00});
    this.cube = new THREE.Mesh(geometry, material);
    this.scene.add(this.cube);
  }

  execute(delta: number, time: number/*, nextFrameDelta: number*/) {
    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.01;

    this.renderer.render(this.scene, this.camera);
  }
}
