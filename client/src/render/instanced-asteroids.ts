import { InstancedMesh, Object3D, Matrix4, DynamicDrawUsage } from 'three';
import type { BufferGeometry, Material, Scene } from 'three';
import type { Transform } from '../../../shared/sim/transform.ts';

// Asteroids are static world geometry: once spawned they never move, so the
// whole field renders as ONE draw call. Each rock's world matrix is written
// once on spawn and never touched again — replacing the old path of one cloned
// Object3D per asteroid (500 clones = 500 draw calls + per-frame interp churn).
//
// Slots stay packed in [0, count): removal swaps the last instance into the
// freed slot, so `mesh.count` is exactly the live rock count. The buffer grows
// (doubling) if the field ever exceeds the initial capacity.
export class InstancedAsteroids {
  mesh: InstancedMesh;
  private scene: Scene;
  private geometry: BufferGeometry;
  private material: Material;
  private idToIndex = new Map<number, number>();
  private indexToId: number[] = [];
  private dummy = new Object3D();
  private scratch = new Matrix4();
  private capacity: number;
  private count = 0;

  constructor(
    scene: Scene,
    geometry: BufferGeometry,
    material: Material,
    capacity = 1024,
  ) {
    this.scene = scene;
    this.geometry = geometry;
    this.material = material;
    this.capacity = capacity;
    this.mesh = this.createMesh(capacity);
    scene.add(this.mesh);
  }

  add(id: number, transform: Transform): void {
    if (this.count >= this.capacity) {
      this.grow();
    }
    const index = this.count++;
    this.idToIndex.set(id, index);
    this.indexToId[index] = id;
    this.writeMatrix(index, transform);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(id: number): void {
    const index = this.idToIndex.get(id);
    if (index === undefined) {
      return;
    }
    const last = this.count - 1;
    if (index !== last) {
      // Move the last live instance into the freed slot to keep [0, count) dense.
      this.mesh.getMatrixAt(last, this.scratch);
      this.mesh.setMatrixAt(index, this.scratch);
      const movedId = this.indexToId[last];
      this.idToIndex.set(movedId, index);
      this.indexToId[index] = movedId;
    }
    this.count = last;
    this.indexToId.length = this.count;
    this.idToIndex.delete(id);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeMatrix(index: number, transform: Transform): void {
    this.dummy.position.copy(transform.position);
    this.dummy.quaternion.copy(transform.rotation);
    this.dummy.scale.setScalar(transform.scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private createMesh(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    mesh.count = this.count;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // A single base-rock bounding sphere would frustum-cull the whole field as
    // one unit; the rocks are scattered across the entire map, so never cull.
    mesh.frustumCulled = false;
    return mesh;
  }

  private grow(): void {
    const bigger = this.createMesh(this.capacity * 2);
    for (let i = 0; i < this.count; i++) {
      this.mesh.getMatrixAt(i, this.scratch);
      bigger.setMatrixAt(i, this.scratch);
    }
    bigger.count = this.count;
    bigger.castShadow = this.mesh.castShadow;
    bigger.receiveShadow = this.mesh.receiveShadow;
    bigger.instanceMatrix.needsUpdate = true;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.scene.add(bigger);
    this.mesh = bigger;
    this.capacity *= 2;
  }
}
