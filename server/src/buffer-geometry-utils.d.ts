import type { BufferGeometry } from 'three';

export const BufferGeometryUtils: {
  mergeBufferGeometries(
    geometries: BufferGeometry[],
    useGroups?: boolean,
  ): BufferGeometry;
};
