import fs from 'fs';
import { Geometry, Face3, Face4 } from 'three';

import { GLTFLoader } from './gltf-loader';
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

  getTriangles(name, scale) {
    const geometry = new Geometry();
    const mesh = this.getModel(name);

    mesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry instanceof Geometry) {
          geometry.merge(child.geometry);
        } else {
          geometry.merge(new Geometry().fromBufferGeometry(child.geometry));
        }
      }
    });

    geometry.scale(scale, scale, scale);

    const vertices = geometry.vertices;
    const triangles = [];

    for (const face of geometry.faces) {
      if ( face instanceof Face3) {
        triangles.push([
          { x: vertices[face.a].x, y: vertices[face.a].y, z: vertices[face.a].z },
          { x: vertices[face.b].x, y: vertices[face.b].y, z: vertices[face.b].z },
          { x: vertices[face.c].x, y: vertices[face.c].y, z: vertices[face.c].z }
        ]);

      } else if ( face instanceof Face4 ) {
        triangles.push([
          { x: vertices[face.a].x, y: vertices[face.a].y, z: vertices[face.a].z },
          { x: vertices[face.b].x, y: vertices[face.b].y, z: vertices[face.b].z },
          { x: vertices[face.d].x, y: vertices[face.d].y, z: vertices[face.d].z }
        ]);
        triangles.push([
          { x: vertices[face.b].x, y: vertices[face.b].y, z: vertices[face.b].z },
          { x: vertices[face.c].x, y: vertices[face.c].y, z: vertices[face.c].z },
          { x: vertices[face.d].x, y: vertices[face.d].y, z: vertices[face.d].z }
        ]);
      }
    }

    return triangles;
  }
}

function trimBuffer(buffer) {
  const { byteOffset, byteLength } = buffer;
  return buffer.buffer.slice(byteOffset, byteOffset + byteLength);
}
