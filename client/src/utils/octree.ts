import {Vector3} from "three";
import {Entity} from 'ecsy';
import {Transform} from '../components/transform';

export class BoundingBox {
  position: Vector3;
  size: Vector3;

  constructor(position: Vector3, size: Vector3) {
    this.position = position;
    this.size = new Vector3().copy(size).multiplyScalar(0.5);
  }

  contains(entity: Entity) {
    const transform = entity.getComponent(Transform);
    const p1 = transform.position;
    const p2 = this.position;
    const s = this.size;

    return p1.x >= p2.x - s.x && p1.x <= p2.x + s.x &&
           p1.y >= p2.y - s.y && p1.y <= p2.y + s.y &&
           p1.z >= p2.z - s.z && p1.z <= p2.z + s.z;
  }

  intersects(point: Vector3, radius: number) {
    const p = this.position;
    const s = this.size;

    const x = Math.max(p.x - s.x, Math.min(point.x, p.x + s.x));
    const y = Math.max(p.y - s.y, Math.min(point.y, p.y + s.y));
    const z = Math.max(p.z - s.z, Math.min(point.z, p.z + s.z));

    const distance = Math.sqrt((x - point.x) * (x - point.x) +
                               (y - point.y) * (y - point.y) +
                               (z - point.z) * (z - point.z));

    return distance < radius;
  }
}

export class Octree {
  private boundary: BoundingBox;
  private capacity: number;
  private entities: any;
  private children: any;
  private divided: boolean;

  constructor(boundary: BoundingBox, capacity: number) {
    this.boundary = boundary;
    this.capacity = capacity;
    this.entities = [];
    this.children = null;
    this.divided = false;
  }

  insert(entity: Entity) {
    if (!this.boundary.contains(entity)) {
      return false;
    }

    if (this.entities.length < this.capacity) {
      this.entities.push(entity);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
    }

    for (const child of this.children) {
      if (child.insert(entity)) {
        return true;
      }
    }

    return false;
  }

  subdivide() {
    this.children = [];
    this.children.length = 8;

    for (let i = 0; i < this.children.length; i++) {
      const size = new Vector3().copy(this.boundary.size);

      const position = new Vector3(
        this.boundary.position.x + (i & 1) * size.x - size.x/2,
        this.boundary.position.y + ((i >> 1) & 1) * size.y - size.y/2,
        this.boundary.position.z + ((i >> 2) & 1) * size.z - size.z/2,
      );

      const boundary = new BoundingBox(position, size);

      this.children[i] = new Octree(boundary, this.capacity);
    }

    this.divided = true;
  }

  query(point: Vector3, radius: number, found: Array<Entity> = []) : Array<Entity> {
    if (!this.boundary.intersects(point, radius)) {
      return [];
    }

    this.entities.forEach((entity: Entity) => {
      if (isEntityInsideSphere(entity, point, radius)) {
        found.push(entity);
      }
    });

    if (this.divided) {
      this.children.forEach((child: Octree) => {
        child.query(point, radius, found);
      });
    }

    return found;
  }

  queryBox(region: BoundingBox, found: Array<Entity> = []) : Array<Entity> {
    if (!this.boundary.intersects(region.position, region.size.x*2)) {
      return [];
    }

    this.entities.forEach((entity: Entity) => {
      if (region.contains(entity)) {
        found.push(entity);
      }
    });

    if (this.divided) {
      this.children.forEach((child: Octree) => {
        child.query(region.position, region.size.x*2, found);
      });
    }

    return found;
  }
}

function isEntityInsideSphere(entity: Entity, point: Vector3, radius: number) : boolean {
  const transform = entity.getComponent(Transform);
  const p = transform.position;

  var distance = Math.sqrt((p.x - point.x) * (p.x - point.x) +
                           (p.y - point.y) * (p.y - point.y) +
                           (p.z - point.z) * (p.z - point.z));

  return distance < radius;
}
