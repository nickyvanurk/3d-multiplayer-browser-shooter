class Player {
  constructor(id, mesh, scene) {
    this.id = id;
    this.mesh = mesh;
    this.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);

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
  }

  updateRotationVector() {
    this.rotationVector.x = -this.rollRight + this.rollLeft;
    this.rotationVector.y = -this.pitch;
    this.rotationVector.z = -this.yawRight + this.yawLeft;
  }
}
