import Entity from './entity.js';

class Bullet extends Entity {
    constructor(scene, playerId, position, rotation, color, velocity) {
        super(scene, new THREE.Vector3(0.2, 0.2, 0.2), position, rotation);
        this.scene = scene;
        this.playerId = playerId;

        this.speed = 120 + velocity;

        this.mesh.material.color = new THREE.Color(color);
    }

    destroy() {
        this.scene.remove(this.mesh);
    }

    update(dt) {
        this.mesh.translateZ(-this.speed * dt);
    }
}

export default Bullet;
