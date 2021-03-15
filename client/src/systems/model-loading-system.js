import { System } from 'ecsy';

import { GltfLoader } from '../components/gltf-loader';
import { Model } from '../components/model';

export class ModelLoadingSystem extends System {
  static queries = {
    loader: {
      components: [GltfLoader]
    },
    models: {
      components: [Model],
      listen: { added: true }
    }
  };

  execute() {
    this.queries.models.added.forEach((entity) => {
      const loaders = this.queries.loader.results;

      if (loaders.length == 0) {
        console.error('Loader entity not found');
        return;
      } else if (loaders.length > 1) {
        console.error('Multiple loader entities found');
      }

      const gltfLoader = loaders[0].getComponent(GltfLoader).value;
      const model = entity.getComponent(Model);

      gltfLoader.load(model.path, (gltf) => {
        const model = entity.getMutableComponent(Model);
        model.scene = gltf.scene;
        model.isLoaded = true;
        console.log(`Loaded model ${model.path}`);
      }, (xhr) => {
        const model = entity.getMutableComponent(Model);
        model.loadingProgess = xhr.loaded / xhr.total * 100;
      }, (error) => {
        console.error(`Failed loading model ${model.path}: ${error}`);
      });
    });
  }
}
