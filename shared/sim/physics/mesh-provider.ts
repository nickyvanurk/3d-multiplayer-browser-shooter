import type { EntityKind } from '../../types.ts';

export type TrianglePoint = { x: number; y: number; z: number };
export type Triangle = [TrianglePoint, TrianglePoint, TrianglePoint];

// The only mesh dependency RapierPhysicsWorld has: turn an entity kind + scale
// into the triangle soup its convex-hull collider is built from. The Node impl
// (server) reads GLBs off disk; the browser impl (client) reuses the GLTF
// scenes the renderer already loaded. This is what makes the Rapier stepper
// runnable on both sides.
export interface MeshProvider {
  init(): Promise<void>;
  getTriangles(kind: EntityKind, scale: number): Triangle[];
}
