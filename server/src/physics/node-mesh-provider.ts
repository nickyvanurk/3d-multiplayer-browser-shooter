import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadingManager } from 'three';

import { AssetManager } from '../asset-manager.ts';
import Types from '../../../shared/types.ts';
import type { EntityKind } from '../../../shared/types.ts';
import type {
  MeshProvider,
  Triangle,
} from '../../../shared/sim/physics/mesh-provider.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Server-side MeshProvider: loads the GLBs off disk through the Node AssetManager
// and hands their triangle soup to RapierPhysicsWorld.
export class NodeMeshProvider implements MeshProvider {
  assetManager!: AssetManager;

  async init(): Promise<void> {
    await new Promise<void>((resolve) => {
      const loadingManager = new LoadingManager();
      loadingManager.onLoad = () => resolve();

      this.assetManager = new AssetManager(loadingManager);
      this.assetManager.loadModel({
        name: 'spaceship',
        url: path.join(__dirname, '../../models/fighter.glb'),
      });
      this.assetManager.loadModel({
        name: 'asteroid',
        url: path.join(__dirname, '../../../client/public/models/asteroid.glb'),
      });
    });
  }

  getTriangles(kind: EntityKind, scale: number): Triangle[] {
    return this.assetManager.getTriangles(
      this.modelName(kind),
      scale,
    ) as Triangle[];
  }

  modelName(kind: EntityKind): string {
    if (kind === Types.Entities.SPACESHIP) {
      return 'spaceship';
    }
    if (kind === Types.Entities.ASTEROID) {
      return 'asteroid';
    }
    throw new Error(`No model for entity type ${kind}`);
  }
}
