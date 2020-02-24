import * as THREE from 'three';

class Camera {
    constructor() {
        this.body = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1e7);
        this.body.position.y = 2;
        this.offset = new THREE.Vector3(0, 2, 15);
        this.smoothSpeed = 0.125;
        this.target =  null;
    }

    update() {
        if (!this.target) {
            return;
        }

        this.followTarget();
    }

    followTarget() {
        let followSpeed = (this.target.speed / this.target.maxSpeed) > this.smoothSpeed ?
                                            (this.target.speed / this.target.maxSpeed) :
                                            this.smoothSpeed;

        var relativeCameraOffset = new THREE.Vector3().copy(this.offset);
        let desiredPosition = relativeCameraOffset.applyMatrix4(this.target.mesh.matrixWorld);
        let smoothedPosition = new THREE.Vector3().lerpVectors(this.body.position, desiredPosition, followSpeed);
        this.body.position.copy(smoothedPosition);

        let desiredQuaternion = this.target.mesh.quaternion;
        this.body.quaternion.slerp(desiredQuaternion, followSpeed);
    }

    setTarget(entity) {
        this.target = entity;
        this.body.position.copy(entity.mesh.position);
        this.body.rotation.set(entity.mesh.rotation.x, entity.mesh.rotation.y, entity.mesh.rotation.z);
        this.body.translateX(this.offset.x)
        this.body.translateY(this.offset.y);
        this.body.translateZ(this.offset.z);
    }
}

export default Camera;
