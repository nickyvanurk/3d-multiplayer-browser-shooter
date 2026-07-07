// Contract: a physics stepper the World drives. Server injects an Ammo-backed
// implementation; the client injects a no-op today (interpolation only) and the
// real stepper later for prediction.
export class NullPhysicsWorld {
  add(_entity) {}
  remove(_entity) {}
  applyControls(_entity, _dt) {}
  step(_dt) {}
  drainCollisions() { return []; }   // [{ a: Entity, b: Entity }]
}
