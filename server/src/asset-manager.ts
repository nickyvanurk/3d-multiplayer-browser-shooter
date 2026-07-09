import fs from 'fs';
import { TextDecoder } from 'node:util';
import atob from 'atob';
import type {
  LoadingManager,
  Group,
  Object3D,
  Mesh,
  BufferGeometry,
} from 'three';

import { GLTFLoader } from './gltf-loader.js';
import { BufferGeometryUtils } from './buffer-geometry-utils.js';

global.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
global.atob = atob;

interface LoadModelParams {
  name: string;
  url: string;
}

// A stored asset is either a parsed GLTF (has `.scene`) or a raw Object3D set
// directly via setModel (has `.clone()`); getModel branches on which.
interface StoredModel {
  scene?: Group;
  clone?(): Object3D;
}

export class AssetManager {
  loadingManager: LoadingManager;
  loader: GLTFLoader;
  models: Map<string, StoredModel>;

  constructor(loadingManager: LoadingManager) {
    this.loadingManager = loadingManager;
    this.loader = new GLTFLoader(this.loadingManager);
    this.models = new Map();
  }

  loadModel(params: LoadModelParams): void {
    if (!params.name || !params.url) {
      return;
    }

    const content = fs.readFileSync(params.url);

    this.loadingManager.itemStart(params.url);

    this.loader.parse(
      trimBuffer(content),
      params.url,
      (gltf) => {
        this.models.set(params.name, gltf);
        this.loadingManager.itemEnd(params.url);
      },
      (e) => {
        console.log(e);
        this.loadingManager.itemError(params.url);
        this.loadingManager.itemEnd(params.url);
      },
    );
  }

  getModel(name: string): Object3D {
    if (typeof this.models.get(name)!.scene === 'undefined') {
      return this.models.get(name)!.clone!();
    }

    return this.models.get(name)!.scene!.clone();
  }

  setModel(name: string, model: StoredModel): void {
    this.models.set(name, model);
  }

  getTriangles(
    name: string,
    scale = 1,
  ): { x: number; y: number; z: number }[][] {
    const geometries: BufferGeometry[] = [];
    const mesh = this.getModel(name);

    // Bake node transforms into child.matrixWorld before reading it: getModel
    // returns a fresh clone that was never added to a scene graph, so its world
    // matrices are stale (identity). Models with a scaled root node (e.g. the
    // transport's 0.01 node over ~13,700-unit geometry) would otherwise yield a
    // hull ~100x too large. Mirrors BrowserMeshProvider.getTriangles.
    mesh.updateMatrixWorld(true);

    mesh.traverse((child) => {
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
    const triangles = [];

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

function trimBuffer(buffer: Buffer): ArrayBuffer {
  const { byteOffset, byteLength } = buffer;
  return buffer.buffer.slice(
    byteOffset,
    byteOffset + byteLength,
  ) as ArrayBuffer;
}
