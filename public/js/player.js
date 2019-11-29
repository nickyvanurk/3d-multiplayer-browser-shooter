class Player {
    constructor(scene, id, position, rotation, health, color, name, mesh, isClient = false) {
        this.scene = scene;
        this.id = id;
        this.isClient = isClient;
        this.kills = 0;

        this.scale = 0.007;
        this.mesh = mesh;
        this.setOrientation(position, rotation);
        for (let i = 0, len = this.mesh.children.length; i < len; i++) {
            this.mesh.children[i].rotateX(Math.PI);
            this.mesh.children[i].rotateZ(Math.PI);
            this.mesh.children[i].scale.set(this.scale, this.scale, this.scale);
        }
        // this.mesh.scale.set(this.scale, this.scale, this.scale);
        console.log(this.mesh);
        const helper = new THREE.BoxHelper(this.mesh);
        helper.geometry.computeBoundingBox();
        this.boundingBox = helper.geometry.boundingBox;
        this.scene.add(this.mesh);

        this.speed = 8; // units/s
        this.rotationSpeed = 2;
        this.health = health;
        this.alive = health > 0;
        this.color = color;
        this.name = name;

        this.speed = 0.1 * 0.016;
        this.maxSpeed = 40 * 0.016;
        this.minSpeed = 0.1 * 0.016;
        this.acceleration = 0.1 * 0.016;
        this.maxAcceleration = 10 * 0.016;

        this.rollSpeed = 0;
        this.maxRollSpeed = 1 * 0.016;
        this.minRollSpeed = 0;
        this.rollAccel = 0.02 * 0.016;
        this.maxRollAccel = 0.5 * 0.016;

        this.yawSpeed = 0.6 * 0.016;
        this.pitchSpeed = 0.6 * 0.016;

        this.forward = 0;
        this.rollLeft = 0;
        this.rollRight = 0;
        this.yaw = 0;
        this.pitch = 0;

        this.tmpQuaternion = new THREE.Quaternion();
        this.rotationVector = new THREE.Vector3();

        this.positionBuffer = [];

        this.healthBar = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.1, 0.01),
            new THREE.MeshBasicMaterial({color: 0x00ff00})
        );
        this.healthBar.renderOrder = 999;
        this.healthBar.onBeforeRender = function (renderer) {renderer.clearDepth();};
        this.healthBar.geometry.translate(this.healthBar.geometry.parameters.width / 2, 0, 0 );
        this.healthBar.geometry.verticesNeedUpdate = true;
        this.healthBar.position.x -= this.healthBar.geometry.parameters.width / 2;
        this.healthBarPivot = new THREE.Object3D();
        this.healthBarPivot.add(this.healthBar);

        let height = (this.boundingBox.max.z - this.boundingBox.min.z) * 0.3;
        if (this.isClient) {
            this.healthBar.position.y = height;
            this.mesh.add(this.healthBarPivot);
        } else {
            this.healthBar.position.y = height * 2.5;
            this.scene.add(this.healthBarPivot);
        }

        let loader = new THREE.FontLoader();

        loader.load('../fonts/helvetiker_regular.typeface.json', function (font) {
            let geometry = new THREE.TextGeometry(this.name, {
                font: font,
                size: 0.3,
                height: 0,
                curveSegments: 12,
            });

            geometry.computeBoundingBox();

            this.nameTag = new THREE.Mesh(
                geometry,
                new THREE.MeshBasicMaterial({color: 0xffff00, flatShading: true})
            );
            this.nameTag .renderOrder = 999;
            this.nameTag .onBeforeRender = function( renderer ) {renderer.clearDepth();};

            var centerOffset = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
            this.nameTag.position.x = centerOffset;

            if (this.isClient) {
                this.nameTag.position.y = height + height / 6;
            } else {
                this.nameTag.position.y = height * 2.5 + height / 6;
            }

            this.healthBarPivot.add(this.nameTag);
        }.bind(this));
    }

    destroy() {
        this.scene.remove(this.mesh);
        this.scene.remove(this.healthBarPivot);
    }

    update(dt, camera) {
        this.healthBar.scale.x = this.health / 100;

        if (this.healthBar.scale.x == 0) {
            this.healthBar.scale.x = 0.00001;
        }

        if (!this.alive && this.positionBuffer.length) {
            this.positionBuffer = [];
        }

        if (this.health == 0 && this.alive) {
            this.alive = false;
        } else if (this.health > 0 && !this.alive) {
            this.alive = true;
        }

        if (!this.isClient){
            this.updateHealthBarOrientation(camera);
        }
    }

    setOrientation(position, rotation) {
        this.mesh.position.set(position.x, position.y, position.z);
        this.mesh.quaternion.copy(rotation);
    }

    setName(name) {
        this.nameTag.geometry.parameters.text = name;
    }

    setColor(color) {
        this.color = color;
        this.mesh.material.color = color;
    }

    updateHealthBarOrientation(camera) {
        this.healthBarPivot.lookAt(camera.getWorldPosition());
        this.healthBarPivot.position.copy(this.mesh.position);
    }

    setNameTagOrientation(camera) {
        this.healthBarPivot.rotation.set(camera.body.rotation.x, camera.body.rotation.y, camera.body.rotation.z);
    }

    applyInput(input) {
        this.forward = ((input.keys & 1) == 1);
        this.rollLeft = ((input.keys & 2) == 2);
        this.rollRight = ((input.keys & 4) == 4);
        this.yaw = input.yaw || 0;
        this.pitch = input.pitch || 0;

        this.mesh.translateZ(-this.speed);

        if (this.forward) {
            this.speed += this.acceleration;
            if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
        } else if (this.speed > this.minSpeed) {
            this.speed -= this.acceleration;
            if (this.speed < this.minSpeed) this.speed = this.minSpeed;
        }

        if (this.rollRight) {
            this.rollSpeed += this.rollAccel;
            if (this.rollSpeed > this.maxRollSpeed) this.rollSpeed = this.maxRollSpeed;
        }

        if (this.rollLeft) {
            this.rollSpeed -= this.rollAccel;
            if (this.rollSpeed < -this.maxRollSpeed) this.rollSpeed = -this.maxRollSpeed;
        }

        if (!this.rollLeft && !this.rollRight) {
            if (this.rollSpeed > this.minRollSpeed) {
                this.rollSpeed -= this.rollAccel;
                if (this.rollSpeed < this.minRollSpeed) this.rollSpeed = this.minRollSpeed;
            } else if (this.rollSpeed < -this.minRollSpeed) {
                this.rollSpeed += this.rollAccel;
                if (this.rollSpeed > -this.minRollSpeed) this.rollSpeed = -this.minRollSpeed;
            }
        }

        this.tmpQuaternion.set(
            -this.pitch * this.pitchSpeed,
            -this.yaw * this.yawSpeed,
            -this.rollSpeed,
            1
        ).normalize();
        this.mesh.quaternion.multiply(this.tmpQuaternion);
        this.mesh.rotation.setFromQuaternion(this.mesh.quaternion, this.mesh.rotation.order);
    }
}

export default Player;
