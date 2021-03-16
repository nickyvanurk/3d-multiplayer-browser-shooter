import { System } from 'ecsy';
import { Vector3, Object3D, InstancedMesh as InstancedMesh$1 } from 'three';

import { WebGlRenderer } from '../components/webgl-renderer';
import { Transform } from '../components/transform';
import { Camera } from '../components/camera';
import { ResourceEntity } from '../../../shared/components/resource-entity';
import { Model } from '../components/model';
import { MeshRenderer } from '../components/mesh-renderer';
import { Loaded } from '../../../shared/components/loaded';
import { Geometry } from '../../../shared/components/geometry'
import { Material } from '../components/material';
import { InstancedMesh } from '../components/instanced-mesh';

export class WebGlRendererSystem extends System {
  static queries = {
    renderers: {
      components: [WebGlRenderer]
    },
    cameras: {
      components: [Transform, Camera]
    },
    resourceEntities: {
      components: [ResourceEntity, Loaded]
    },
    meshRenderers: {
      components: [MeshRenderer],
      listen: {
        added: true,
        removed: true
      }
    },
    instancedMeshes: {
      components: [ResourceEntity, InstancedMesh, Geometry, Material],
      listen: {
        added: true,
        removed: true
      }
    },
    objects: {
      components: [Transform, MeshRenderer],
      listen: {
        added: true,
        removed: true
      }
    }
  };

  init() {
    this.needsResize = true;
    window.addEventListener('resize', this.onResize.bind(this));
    this.dummy = new Object3D();
  }

  execute() {
    this.queries.meshRenderers.added.forEach((entity) => {
      const resource = this.tryGetResourceEntity(entity);

      if (!resource) {
        console.error('Resource entity not found');
        return;
      }

      const meshRenderer = entity.getMutableComponent(MeshRenderer);

      if (resource.hasComponent(Model)) {
        const model = resource.getComponent(Model);
        meshRenderer.scene = model.scene.clone();
        meshRenderer.scene.visible = false;
      } else if (resource.hasComponent(InstancedMesh)) {
        const geometry = resource.getComponent(Geometry).value;
        const material = resource.getComponent(Material).value;
        const instancedMesh = resource.getMutableComponent(InstancedMesh);
        instancedMesh.value = new InstancedMesh$1(geometry, material, instancedMesh.count);

        this.dummy.scale.setScalar(0); // Make invisible, TODO: Move to shader
        this.dummy.updateMatrix();

        instancedMesh.value.setMatrixAt(entity.worldId, this.dummy.matrix);
        instancedMesh.value.instanceMatrix.needsUpdate = true;

        meshRenderer.scene = instancedMesh.value;
      } else {
        console.error('Failed adding mesh to MeshRenderer');
        return;
      }

      const webGlRenderer = this.tryGetWebGlRenderer();

      if (!webGlRenderer) {
        console.error('WebGlRenderer not found');
        return;
      }

      webGlRenderer.scene.add(meshRenderer.scene);
    });

    this.queries.meshRenderers.removed.forEach((entity) => {
      const webGlRenderer = this.tryGetWebGlRenderer();

      if (!webGlRenderer) {
        console.error('WebGlRenderer not found');
        return;
      }

      const meshRenderer = entity.getRemovedComponent(MeshRenderer);
      webGlRenderer.scene.remove(meshRenderer.scene);
    });

    this.queries.objects.added.forEach((entity) => {
      const transform = entity.getComponent(Transform);
      const meshRenderer = entity.getMutableComponent(MeshRenderer);

      if (meshRenderer.scene instanceof InstancedMesh$1) {
        this.dummy.position.copy(transform.position);
        this.dummy.quaternion.copy(transform.rotation);
        this.dummy.scale.setScalar(transform.scale); // Make invisible
        this.dummy.updateMatrix();

        meshRenderer.scene.setMatrixAt(entity.worldId, this.dummy.matrix);
        meshRenderer.scene.instanceMatrix.needsUpdate = true;
        return;
      }

      meshRenderer.scene.visible = true;
      meshRenderer.scene.position.copy(transform.position);
      meshRenderer.scene.quaternion.copy(transform.rotation);
      meshRenderer.scene.scale.copy(new Vector3().setScalar(transform.scale));
    });

    this.queries.objects.removed.forEach((entity) => {
      if (entity.hasRemovedComponent(MeshRenderer)) return;

      const meshRenderer = entity.getMutableComponent(MeshRenderer);

      if (meshRenderer.scene instanceof InstancedMesh$1) {
        this.dummy.scale.setScalar(0); // Make invisible
        this.dummy.updateMatrix();

        meshRenderer.scene.setMatrixAt(entity.worldId, this.dummy.matrix);
        meshRenderer.scene.instanceMatrix.needsUpdate = true;
        return;
      }

      meshRenderer.scene.visible = false;
    });
  }

  render(alpha) {
    this.queries.objects.results.forEach((entity) => {
      const transform = entity.getComponent(Transform);

      const renderPosition = transform.position.clone()
        .multiplyScalar(alpha)
        .add(transform.prevPosition.clone().multiplyScalar(1 - alpha));
      const renderRotation = transform.prevRotation.clone()
        .slerp(transform.rotation, alpha);

      const meshRenderer = entity.getMutableComponent(MeshRenderer);

      if (meshRenderer.scene instanceof InstancedMesh$1) {
        this.dummy.position.copy(transform.position);
        this.dummy.quaternion.copy(transform.rotation);
        this.dummy.updateMatrix();

        meshRenderer.scene.setMatrixAt(entity.worldId, this.dummy.matrix);
        meshRenderer.scene.instanceMatrix.needsUpdate = true;
        return;
      }

      meshRenderer.scene.position.copy(renderPosition);
      meshRenderer.scene.quaternion.copy(renderRotation);
      meshRenderer.scene.scale.copy(new Vector3().setScalar(transform.scale));
    });

    this.queries.cameras.results.forEach((entity) => {
      const transform = entity.getComponent(Transform);
      const camera = entity.getMutableComponent(Camera).value;

      const renderPosition = transform.position.clone()
        .multiplyScalar(alpha)
        .add(transform.prevPosition.clone().multiplyScalar(1 - alpha));
      const renderRotation = transform.prevRotation.clone()
        .slerp(transform.rotation, alpha);

      camera.position.copy(renderPosition);
      camera.quaternion.copy(renderRotation);
    });

    this.queries.renderers.results.forEach((entity) => {
      const component = entity.getComponent(WebGlRenderer);
      const camera = component.camera.getComponent(Camera).value;
      const scene = component.scene;
      const renderer = component.renderer;
      const composer = component.composer;

      if (this.needsResize) {
        const currentPixelRatio = renderer.getPixelRatio();

        if (currentPixelRatio !== window.devicePixelRatio) {
          renderer.setPixelRatio(window.devicePixelRatio);
        }

        const canvas = renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        composer.setSize(width, height);

        this.needsResize = false;
      }

      composer.render(scene, camera);
    });
  }

  tryGetWebGlRenderer() {
    const renderer = this.tryGetWebGlRendererEntity();

    if (!renderer) {
      console.error('Renderer entity not found');
      return false;
    }

    return renderer.getComponent(WebGlRenderer);
  }

  tryGetWebGlRendererEntity() {
    const renderers = this.queries.renderers.results;

    if (!renderers.length) return false;

    return renderers[0];
  }

  tryGetResourceEntity(entity) {
    const resources = this.queries.resourceEntities.results;

    if (!resources.length) return false;

    let resource = false;

    for (const resourceEntity of resources) {
      if (resourceEntity.hasAnyComponents(entity.getComponentTypes())) {
        resource = resourceEntity;
        break;
      }
    }

    return resource;
  }

  onResize() {
    this.needsResize = true;
  }
}
