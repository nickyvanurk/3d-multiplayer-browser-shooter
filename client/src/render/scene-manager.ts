import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Fog,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Points,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';

// Games conventionally specify horizontal FOV; three.js expects vertical.
const HORIZONTAL_FOV = 90;

function verticalFov(horizontalFovDeg: number, aspect: number): number {
  const hRad = (horizontalFovDeg * Math.PI) / 180;
  const vRad = 2 * Math.atan(Math.tan(hRad / 2) / aspect);
  return (vRad * 180) / Math.PI;
}

export class SceneManager {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  composer: EffectComposer;
  needsResize: boolean;

  constructor() {
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x020207);
    renderer.shadowMap.enabled = true;
    renderer.autoClear = false;

    document.body.appendChild(renderer.domElement);

    const scene = new Scene();

    const aspect = window.innerWidth / window.innerHeight;
    const camera = new PerspectiveCamera(
      verticalFov(HORIZONTAL_FOV, aspect),
      aspect,
      1,
      4100,
    );

    scene.add(camera);

    scene.add(new AmbientLight(0x222222));

    let light = new DirectionalLight(0xffffff);
    light.position.set(1, 1, 1);
    scene.add(light);

    light = new DirectionalLight(0x002288);
    light.position.set(-1, -1, -1);
    scene.add(light);

    scene.fog = new Fog(0x020207, 10, 2000);

    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = renderer.getPixelRatio();

    fxaaPass.material.uniforms['resolution'].value.x =
      1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y =
      1 / (window.innerHeight * pixelRatio);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(fxaaPass);
    // Original JS passed `undefined` for the resolution arg; cast preserves that verbatim.
    composer.addPass(
      new UnrealBloomPass(
        undefined as unknown as import('three').Vector2,
        1.0,
        0.5,
        0,
      ),
    );

    camera.position.z = -14;
    camera.rotation.y += Math.PI;

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.composer = composer;

    this.needsResize = true;
    window.addEventListener('resize', () => {
      this.needsResize = true;
    });

    this.addStars(scene, 1000, 4000);
  }

  addStars(scene: Scene, count: number, radius: number): void {
    const positions: number[] = [];

    for (let i = 0; i < count; i++) {
      const r = radius;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const x =
        r * Math.cos(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000);
      const y =
        r * Math.sin(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000);
      const z = r * Math.cos(phi) + (-1000 + Math.random() * 2000);
      positions.push(x);
      positions.push(y);
      positions.push(z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3),
    );
    const material = new PointsMaterial({
      color: 0xffffff,
      size: 12.5,
      fog: false,
    });
    const mesh = new Points(geometry, material);

    scene.add(mesh);
  }

  render(_alpha: number): void {
    if (this.needsResize) {
      const renderer = this.renderer;

      if (renderer.getPixelRatio() !== window.devicePixelRatio) {
        renderer.setPixelRatio(window.devicePixelRatio);
      }

      const canvas = renderer.domElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      this.camera.aspect = width / height;
      this.camera.fov = verticalFov(HORIZONTAL_FOV, this.camera.aspect);
      this.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      this.composer.setSize(width, height);

      this.needsResize = false;
    }

    this.composer.render();
  }
}
