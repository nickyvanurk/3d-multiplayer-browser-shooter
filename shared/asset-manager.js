import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class AssetManager {
  constructor(loadingManager) {
    this.loadingManager = loadingManager;
    this.loader = new GLTFLoader(this.loadingManager);
    this.models = new Map();
  }

  loadModel(params) {
    if (!params.name || !params.url) {
      return;
    }

    const args = {
      receiveShadow: false,
      castShadow: false,
      envMapOverride: null,
      ...params
    };

    this.loader.load(args.url, (gltf) => {
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = args.receiveShadow;
          child.castShadow = args.castShadow;

          if (args.envMapOverride) {
            child.material.envMap = args.envMapOverride;
          }
        }
      });

      this.models.set(args.name, gltf);
    });
  }

  getModel(name) {
    return this.models.get(name).scene.clone();
  }
}
