import {
  InstancedMesh,
  DodecahedronBufferGeometry,
  MeshBasicMaterial,
  Object3D,
  Matrix4,
  DynamicDrawUsage,
  type Vector3,
} from 'three';
import type { Scene } from 'three';

import type { SceneManager } from './scene-manager.ts';
import { CHUNK_TTL_MS } from '../../../shared/sim/mining.ts';

// Warm amber so a chunk reads as valuable ore even in shadow.
const ORE_COLOR = 0xffb347;
// Small debris — subtle enough to mine unnoticed, well under the 45u collect
// radius.
const CHUNK_RADIUS = 3;

// Client-side ore chunks, driven entirely by server events: OreDrop adds one at
// the impact point the server chose, Collect removes it (collection is
// server-authoritative), and an uncollected one ages out on the same TTL. No
// derivation — the client renders exactly the ore field the server reports.
export class OrePickupService {
  private scene: Scene;
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private scratch = new Matrix4();
  // chunk id -> instance slot, kept dense in [0, count).
  private idToIndex = new Map<number, number>();
  private indexToId: number[] = [];
  private expiry = new Map<number, number>();
  private capacity: number;
  private count = 0;
  // Emitted at a chunk's position when it spawns, so the caller can throw a
  // dust puff there (dust puff hook).
  onSpawn: ((position: Vector3) => void) | null = null;

  constructor(sceneManager: SceneManager, capacity = 512) {
    this.scene = sceneManager.scene;
    this.capacity = capacity;
    this.mesh = this.createMesh(capacity);
    this.scene.add(this.mesh);
  }

  // A chunk broke off (OreDrop): render it and start its TTL. `now` is
  // performance.now — chunk lifetime is cosmetic, not part of the sim clock.
  spawn(id: number, position: Vector3, now: number): void {
    if (this.idToIndex.has(id)) {
      return;
    }
    if (this.count >= this.capacity) {
      this.grow();
    }
    const index = this.count++;
    this.idToIndex.set(id, index);
    this.indexToId[index] = id;
    this.expiry.set(id, now + CHUNK_TTL_MS);
    this.writeMatrix(index, position);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.onSpawn?.(position);
  }

  // Remove a chunk the server says was collected. Unknown ids are a harmless
  // no-op (e.g. a chunk that already aged out locally).
  collect(id: number): void {
    this.remove(id);
  }

  // Per-frame: age out uncollected chunks past their TTL.
  update(now: number): void {
    for (const [id, at] of [...this.expiry]) {
      if (at <= now) {
        this.remove(id);
      }
    }
  }

  private remove(id: number): void {
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
    this.expiry.delete(id);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeMatrix(index: number, position: Vector3): void {
    this.dummy.position.copy(position);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private createMesh(capacity: number): InstancedMesh {
    const geometry = new DodecahedronBufferGeometry(CHUNK_RADIUS, 0);
    const material = new MeshBasicMaterial({ color: ORE_COLOR, fog: true });
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.count = this.count;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // Chunks are scattered across the field; a single bounding sphere would cull
    // the whole batch as one unit, so never cull.
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
    bigger.instanceMatrix.needsUpdate = true;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.scene.add(bigger);
    this.mesh = bigger;
    this.capacity *= 2;
  }
}
