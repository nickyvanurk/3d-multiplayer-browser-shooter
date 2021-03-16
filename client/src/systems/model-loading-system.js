import { System, Not } from 'ecsy';

import Utils from '../../../shared/utils';

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
      components: [Model]
    },
    unloadedModels: {
      components: [Model, Not(Loading), Not(Loaded)],
      listen: { added: true }
    },
    loadedModels: {
      components: [Model, Loaded]
    },
  };

  execute() {
    this.queries.unloadedModels.added.forEach((entity) => {
      const loader = this.tryGetLoader();

      if (!loader) {
        console.error('Loader entity not found');
        return;
      }

      const gltfLoader = loader.getComponent(GltfLoader).value;
      const model = entity.getComponent(Model);

      gltfLoader.load(model.path, (gltf) => {
        this.handleLoaded(entity, gltf);

        if (this.loadedAllModels()) {
          Utils.startWorldExecution(this.world);
          this.stop();
        }
      }, (xhr) => {
        this.handleProgress(entity, xhr);
      }, (error) => {
        console.error(`Failed loading model ${model.path}: ${error}`);
      });
    });

    if (!this.loadedAllModels()) {
      Utils.stopWorldExecution(this.world);
    }
  }

  handleLoaded(entity, gltf) {
    const model = entity.getMutableComponent(Model);
    model.scene = gltf.scene;

    entity.addComponent(Loaded);
    entity.removeComponent(Loading);

    console.log(`Loaded model ${model.path}`);
  }

  handleProgress(entity, xhr) {
    const loadingPercentage = xhr.loaded / xhr.total * 100;

    if (!entity.hasComponent(Loading)) {
      entity.addComponent(Loading, { progress: loadingPercentage });
      return;
    }

    const loading = entity.getMutableComponent(Loading);
    loading.progess = loadingPercentage;
  }

  tryGetLoader() {
    const loaders = this.queries.loader.results;

    if (!loaders.length) return false;

    return loaders[0];
  }

  loadedAllModels() {
    const numModels = this.queries.models.results.length;
    const numLoadedModels = this.queries.loadedModels.results.length;
    return numModels === numLoadedModels;
  }
}
