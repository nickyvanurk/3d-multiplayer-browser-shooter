export function spawnSpaceship(ecs, position) {
    logger.debug(`Spawning spaceship`);

    const spaceship = ecs
      .createEntity()
      // TODO: Add collision shape here
      .addComponent(Transform, { position })
      .addComponent(RigidBody, {
        acceleration: 0.8,
        angularAcceleration: new Euler(0.15, 0.3, 0.05),
        damping: 0.5,
        angularDamping: 0.99
      })
      .addComponent(Health);

    const weaponLeft = ecs
      .createEntity()
      .addComponent(Weapon, {
        offset: new Vector3(-0.5, 0, -0.5),
        fireInterval: 100,
        parent: player
      });

    const weaponRight = ecs
      .createEntity()
      .addComponent(Weapon, {
        offset: new Vector3(0.5, 0, -0.5),
        fireInterval: 100,
        parent: player
      });

    spaceship.addComponent(Weapons, { primary: [weaponLeft, weaponRight] });

    return spaceship;
}
