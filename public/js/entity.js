class Entity {
    constructor(scene, size, position, rotation) {
        this.mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size.x, size.y, size.z),
            new THREE.MeshPhongMaterial({color: 0xff0000})
        );

        this.setOrientation(position, rotation);

        scene.add(this.mesh);
    }
  
    setOrientation(position, rotation) {
        this.mesh.position.set(position.x, position.y, position.z);
        this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
}

export default Entity;
