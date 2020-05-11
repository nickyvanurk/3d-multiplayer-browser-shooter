import {LoadingManager} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';

export class AssetManager {
  private loadingManager: LoadingManager;
  private loader: GLTFLoader;
  private models: Map<string, any>;

  constructor() {
    this.loadingManager = new LoadingManager();
    this.loader = new GLTFLoader(this.loadingManager);
    this.models = new Map<string, any>();
  }

  onStart(callback: (url: string, itemsLoaded: number, itemsTotal: number) => void) {
    this.loadingManager.onStart = callback;
  }

  onLoad(callback: () => void) {
    this.loadingManager.onLoad = callback;
  }

  onProgress(callback: (url: string, itemsLoaded: number, itemsTotal: number) => void) {
    this.loadingManager.onProgress = callback;
  }

  onError(callback: (url: string) => void) {
    this.loadingManager.onError = callback;
  }

  loadModel(params: any) {
    if (!params.name || !params.url) {
      return;
    }

    const args: any = {
      receiveShadow: false,
      castShadow: false,
      envMapOverride: null,
      ...params
    };

    this.loader.load(args.url, (gltf: any) => {
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          child.receiveShadow = args.receiveShadow;
          child.castShadow = args.castShadow;

          if (args.envMapOverride) {
            child.material.envMap = args.envMapOverride;
          }
        }
      });

      gltf.scene.scale.set(0.005, 0.005, 0.005);

      this.models.set(args.name, gltf);
    });
  }

  getModel(name: string) {
    return this.models.get(name);
  }
}
