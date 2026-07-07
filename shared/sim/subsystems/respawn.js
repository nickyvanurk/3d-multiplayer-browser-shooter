export class RespawnSubsystem {
  update(world, dt) {
    for (const entity of world.entities.values()) {
      if (entity.alive === false) {
        entity.respawnTimer -= dt;
        if (entity.respawnTimer <= 0) {
          entity.alive = true;
          entity.health = 100;
          entity.velocity.set(0, 0, 0);
          entity.angularVelocity.set(0, 0, 0);
        }
      }
    }
  }
}
