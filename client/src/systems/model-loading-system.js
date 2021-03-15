import { System, Not } from 'ecsy';

import { GltfLoader } from '../components/gltf-loader';
import { Model } from '../components/model';
import { Loading } from '../../../shared/components/loading';
import { Loaded } from '../../../shared/components/loaded';

export class ModelLoadingSystem extends System {
  static queries = {
    loader: {
      components: [GltfLoader]
    },
    models: {
      components: [Model, Not(Loading), Not(Loaded)],
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

        entity.addComponent(Loaded);
        entity.removeComponent(Loading);

        console.log(`Loaded model ${model.path}`);
      }, (xhr) => {
        const loadingPercentage = xhr.loaded / xhr.total * 100;

        if (!entity.hasComponent(Loading)) {
          entity.addComponent(Loading, { progress: loadingPercentage });
          return;
        }

        const loading = entity.getMutableComponent(Loading);
        loading.progess = loadingPercentage;
      }, (error) => {
        console.error(`Failed loading model ${model.path}: ${error}`);
      });
    });
  }
}
