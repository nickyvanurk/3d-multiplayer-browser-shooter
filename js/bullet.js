class Bullet {
  constructor(parent, scene) {
    this.parent = parent;
    this.magnitude = 10;
    this.alive = true;

    this.mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 3, 8),
      new THREE.MeshBasicMaterial({color:0xff0000})
    );
    this.mesh.geometry.translate(0, 3 / 2, 0);
    this.mesh.geometry.applyMatrix(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

    this.mesh.position.copy(this.parent.mesh.position);
    this.mesh.rotation.copy(this.parent.mesh.rotation);

    scene.add(this.mesh);
  }

  update() {
    this.mesh.translateX(-(this.parent.magnitude + this.magnitude));
  }
}
