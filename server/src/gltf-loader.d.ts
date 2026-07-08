import type { LoadingManager, Group } from 'three';

export interface GLTF {
  scene: Group;
}

export class GLTFLoader {
  constructor(manager?: LoadingManager);
  parse(
    data: ArrayBuffer,
    path: string,
    onLoad: (gltf: GLTF) => void,
    onError?: (event: unknown) => void,
  ): void;
}
