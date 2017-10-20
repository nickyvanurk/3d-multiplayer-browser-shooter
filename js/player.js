class Player {
  constructor(id, mesh, scene) {
    this.id = id;
    this.mesh = mesh;
    this.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    this.scene = scene;

    this.magnitude = 0;
    this.maxMagnitude = 50;
    this.minMagnitude = 0.1;

    this.acceleration = 0.01;
    this.maxAcceleration = 1;

    this.rollSpeed = 0.02;
    this.yawSpeed = 0.01;
    this.pitchSpeed = 0.01;

    this.forward = 0;
    this.break = 0;
    this.rollLeft = 0;
    this.rollRight = 0;
    this.yawLeft = 0;
    this.yawRight = 0;
    this.pitch = 0;

    this.tmpQuaternion = new THREE.Quaternion();
    this.rotationVector = new THREE.Vector3();

    this.canShoot = false;
    this.shootInterval = 10;
    this.projectiles = [];
    this.projectileLifetime = 1500;

    this.scene.add(this.mesh);
  }

  update() {
    this.mesh.translateX(-this.magnitude);

    this.tmpQuaternion.set(
      this.rotationVector.x * this.rollSpeed,
      this.rotationVector.y * this.pitchSpeed,
      this.rotationVector.z * this.yawSpeed,
      1
    ).normalize();
    this.mesh.quaternion.multiply(this.tmpQuaternion);
    this.mesh.rotation.setFromQuaternion(this.mesh.quaternion, this.mesh.rotation.order);

    if (this.forward) {
      this.magnitude += this.acceleration;
      if (this.magnitude > this.maxMagnitude) this.magnitude = this.maxMagnitude;
    } else if (this.magnitude > this.minMagnitude) {
      this.magnitude -= this.acceleration + (this.acceleration * 3 * this.break);
      if (this.magnitude < this.minMagnitude) this.magnitude = this.minMagnitude;
    }

    for (let i = 0; i < this.projectiles.length; i++) {
      if (this.projectiles[i] == undefined) continue;
      if (this.projectiles[i].alive == false) {
        this.projectiles.splice(i, 1);
        continue;
      }
      this.projectiles[i].update();
    }

    if (this.canShoot && this.shootInterval == 0) {
      this.shootInterval = 10;
      this.shoot();
    }

    if (this.shootInterval > 0) this.shootInterval -= 1;
  }

  shoot() {
    var projectile1 = new Bullet(this, this.scene);
    projectile1.mesh.translateX(-11);
    projectile1.mesh.translateY(11.1);
    projectile1.mesh.translateZ(-0.7);
    this.projectiles.push(projectile1);

    var projectile2 = new Bullet(this, this.scene);
    projectile2.mesh.translateX(-11);
    projectile2.mesh.translateY(-11.1);
    projectile2.mesh.translateZ(-0.7);
    this.projectiles.push(projectile2);

    setTimeout(function () {
      projectile1.alive = false;
      this.scene.remove(projectile1.mesh);

      projectile2.alive = false;
      this.scene.remove(projectile2.mesh);
    }.bind(this), this.projectileLifetime);
  }

  updateRotationVector() {
    this.rotationVector.x = -this.rollRight + this.rollLeft;
    this.rotationVector.y = -this.pitch;
    this.rotationVector.z = -this.yawRight + this.yawLeft;
  }
}
