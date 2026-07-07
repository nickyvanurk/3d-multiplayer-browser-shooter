// shared/sim/entity.js
import { Transform } from './transform.js';

export class Entity {
  constructor({ id, type, transform } = {}) {
    this.id = id;
    this.type = type;            // Types.Entities.*
    this.transform = new Transform(transform);
    this.destroyed = false;
  }

  update(_dt, _world, _time) {}

  markDestroyed() { this.destroyed = true; }

  // Network state = the fields that replicate to clients (position + rotation).
  // Matches the Messages.World wire layout (7 numbers after the id).
  serializeNetworkState() {
    const { position: p, rotation: r } = this.transform;
    return [p.x, p.y, p.z, r.x, r.y, r.z, r.w];
  }

  applyNetworkState([px, py, pz, rx, ry, rz, rw]) {
    this.transform.position.set(px, py, pz);
    this.transform.rotation.set(rx, ry, rz, rw);
  }
}
