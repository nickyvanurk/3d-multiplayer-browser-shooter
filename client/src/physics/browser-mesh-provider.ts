import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils';
import type { Group, Mesh, BufferGeometry } from 'three';

import type { EntityKind } from '../../../shared/types.ts';
import type {
  MeshProvider,
  Triangle,
} from '../../../shared/sim/physics/mesh-provider.ts';

// Browser-side MeshProvider: reuses the GLTF scenes the renderer (ViewRegistry)
// already loaded, so the client's Rapier stepper builds the same convex hulls
// as the server without a second network fetch. Mirrors the triangle-extraction
// in the Node AssetManager.getTriangles.
export class BrowserMeshProvider implements MeshProvider {
  models: Map<number, Group>;

  constructor(models: Map<number, Group>) {
    this.models = models;
  }

  // Models are already loaded by ViewRegistry.load() before physics init.
  async init(): Promise<void> {}

  getTriangles(kind: EntityKind, scale: number): Triangle[] {
    const model = this.models.get(kind);
    if (!model) {
      throw new Error(`No loaded model for entity kind ${kind}`);
    }

    // Refresh world matrices before reading child.matrixWorld: the stored GLTF
    // scene was never added to a render graph, so its matrixWorld is stale
    // (identity). The fighter/asteroid meshes carry their display scale on a
    // node (e.g. 0.01 over 1500-unit geometry); without this the extracted hull
    // is ~100x too large → ~10,000x rotational inertia (ship won't turn) and
    // oversized colliders.
    model.updateMatrixWorld(true);

    const geometries: BufferGeometry[] = [];
    model.traverse((child) => {
      if ((child as Mesh).isMesh) {
        geometries.push(
          (child as Mesh).geometry
            .clone()
            .scale(scale, scale, scale)
            .applyMatrix4(child.matrixWorld),
        );
      }
    });

    const geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
    const vertices = geometry.attributes.position.array;
    const triangles: Triangle[] = [];

    for (let i = 0; i < vertices.length; i += 9) {
      triangles.push([
        { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] },
        { x: vertices[i + 3], y: vertices[i + 4], z: vertices[i + 5] },
        { x: vertices[i + 6], y: vertices[i + 7], z: vertices[i + 8] },
      ]);
    }

    return triangles;
  }
}
