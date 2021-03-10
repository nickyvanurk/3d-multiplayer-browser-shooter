import fs from 'fs';

import { GLTFLoader } from './gltf-loader';
import { BufferGeometryUtils } from './buffer-geometry-utils';
global.TextDecoder = require('util').TextDecoder;
global.atob = require('atob');

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

    const content = fs.readFileSync(params.url);

    this.loadingManager.itemStart(params.url);

    this.loader.parse(trimBuffer(content), params.url, (gltf) => {
      this.models.set(params.name, gltf);
      this.loadingManager.itemEnd(params.url);
    }, (e) => {
      console.log(e);
      this.loadingManager.itemError(params.url);
      this.loadingManager.itemEnd(params.url);
    });
  }

  getModel(name) {
    if (typeof this.models.get(name).scene === 'undefined') {
      return this.models.get(name).clone();
    }

    return this.models.get(name).scene.clone();
  }

  setModel(name, model) {
    this.models.set(name, model);
  }

  getTriangles(name, scale = 1) {
    const geometries = [];
    const mesh = this.getModel(name);

    mesh.traverse((child) => {
      if (child.isMesh) {
        geometries.push(child.geometry.clone().scale(scale, scale, scale).applyMatrix4(child.matrixWorld));
      }
    });

    const geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
    const vertices = geometry.attributes.position.array;
    const triangles = [];

    for (let i = 0; i < vertices.length; i += 9) {
        triangles.push([
          { x: vertices[i], y: vertices[i+1], z: vertices[i+2] },
          { x: vertices[i+3], y: vertices[i+4], z: vertices[i+5] },
          { x: vertices[i+6], y: vertices[i+7], z: vertices[i+8] }
        ]);
    }

    return triangles;
  }
}

function trimBuffer(buffer) {
  const { byteOffset, byteLength } = buffer;
  return buffer.buffer.slice(byteOffset, byteOffset + byteLength);
}
