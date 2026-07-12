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
  Group,
  Vector2,
  WebGLMultisampleRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';

// Games conventionally specify horizontal FOV; three.js expects vertical.
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
  horizontalFov: number;
  stars!: Points;
  // Holds every server-driven entity view (asteroids, ships, vendor, bullets).
  // Hidden until the local ship spawns so the boot screen shows only the
  // client-generated background (starfield + fog) and never the pre-spawn scene
  // framed from the camera's origin pose, which would lurch on spawn.
  worldGroup: Group;

  constructor(horizontalFov = 90) {
    this.horizontalFov = horizontalFov;

    // Asteroids are placed densely enough that large rocks interpenetrate; a
    // logarithmic depth buffer spreads depth precision evenly across the
    // near->far range so those overlaps stop z-fighting at distance.
    const renderer = new WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setClearColor(0x020207);
    renderer.shadowMap.enabled = true;
    renderer.autoClear = false;

    document.body.appendChild(renderer.domElement);

    const scene = new Scene();

    const aspect = window.innerWidth / window.innerHeight;
    const camera = new PerspectiveCamera(
      verticalFov(horizontalFov, aspect),
      aspect,
      1,
      4100,
    );

    scene.add(camera);

    const worldGroup = new Group();
    worldGroup.visible = false;
    scene.add(worldGroup);
    this.worldGroup = worldGroup;

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

    // Render into a multisampled target so the 3D pass gets true MSAA. Without
    // this the composer renders to a plain render target and the renderer's
    // `antialias` is ignored, leaving only FXAA — which can't stop distant
    // asteroid edges/terminators from shimmering as the camera moves.
    const size = renderer.getDrawingBufferSize(new Vector2());
    const renderTarget = new WebGLMultisampleRenderTarget(size.x, size.y);
    const composer = new EffectComposer(renderer, renderTarget);
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

    // Stars sit on a spherical shell whose outer radius stays inside the
    // camera's far plane (4100). A star directly ahead has view-space depth
    // equal to its radius, so any star past the far plane would be clipped and
    // pop in/out as the camera rotates. Keeping the whole shell within the far
    // plane makes the field cull-free from every angle.
    for (let i = 0; i < count; i++) {
      const r = radius * (0.8 + 0.2 * Math.random());
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.cos(theta) * Math.sin(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(phi);
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
    this.stars = mesh;
  }

  // Reveal (or re-hide) the server-driven world. Called the moment the local
  // ship spawns, so entities appear already framed on the ship rather than from
  // the camera's origin pose.
  setWorldVisible(visible: boolean): void {
    this.worldGroup.visible = visible;
  }

  // Apply a new horizontal FOV live; the vertical FOV three.js uses is derived
  // from the current aspect ratio.
  setHorizontalFov(horizontalFovDeg: number): void {
    this.horizontalFov = horizontalFovDeg;
    this.camera.fov = verticalFov(horizontalFovDeg, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  render(_alpha: number): void {
    // Keep the starfield centred on the camera so it translates with the player
    // but stays world-aligned. Removing translation parallax makes the stars
    // read as infinitely distant — you can pan across them by turning, but you
    // can never fly up to or through them.
    this.stars.position.copy(this.camera.position);

    if (this.needsResize) {
      const renderer = this.renderer;

      if (renderer.getPixelRatio() !== window.devicePixelRatio) {
        renderer.setPixelRatio(window.devicePixelRatio);
      }

      const canvas = renderer.domElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      this.camera.aspect = width / height;
      this.camera.fov = verticalFov(this.horizontalFov, this.camera.aspect);
      this.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      this.composer.setSize(width, height);

      this.needsResize = false;
    }

    this.composer.render();
  }
}
