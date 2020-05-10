import {System} from 'ecsy';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {GltfLoader} from '../components/gltf-loader';
import {GltfModel} from '../components/gltf-model';
import {Object3d} from '../components/object3d';

const loader = new GLTFLoader();

export class GltfLoading extends System {
  static queries: any = {
    entities: {
      components: [GltfLoader],
      listen: {
        added: true,
        removed: true
      }
    }
  };

  public queries: any;

  execute() {
    this.queries.entities.added.forEach((entity: any) => {
      const component = entity.getComponent(GltfLoader);

      loader.load(component.url, (gltf: any) => {
        gltf.scene.traverse((child: any) => {
          if (child.isMesh) {
            child.receiveShadow = component.receiveShadow;
            child.castShadow = component.castShadow;

            if (component.envMapOverride) {
              child.material.envMap = component.envMapOverride;
            }
          }
        });

        gltf.scene.scale.set(0.01, 0.01, 0.01);

        entity.addComponent(GltfModel, {value: gltf});
        entity.addComponent(Object3d, {value: gltf.scene});
      });
    });

    this.queries.entities.removed.forEach((entity: any) => {
      const object = entity.getComponent(Object3d, true).value;
      object.parent.remove(object);
    });
  }
}
