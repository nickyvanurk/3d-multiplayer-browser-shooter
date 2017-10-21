class Entity {
  constructor(scene, position) {
    this.height = 1;
    this.speed = 2; // units/s
    this.positionBuffer = [];
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, this.height, 1),
      new THREE.MeshPhongMaterial({color: 0xff0000})
    );
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.healthBar = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 0),
      new THREE.MeshBasicMaterial({color: 0x00ff00})
    );
    this.healthBar.geometry.translate(this.healthBar.geometry.parameters.width / 2, 0, 0 );
    this.healthBar.geometry.verticesNeedUpdate = true;
    this.healthBar.position.x -= this.healthBar.geometry.parameters.width / 2;
    this.healthBarPivot = new THREE.Object3D();
    this.healthBarPivot.add(this.healthBar);
    scene.add(this.healthBarPivot);
  }

  setOrientation(position, rotation) {
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.set(rotation.x, rotation.y, rotation.z);

    this.healthBarPivot.position.copy(this.mesh.position);
    this.healthBarPivot.position.y = this.height + this.height / 3;
  }

  updateHealth(health) {
    this.healthBar.scale.x = health / 100;
  }

  applyInput(input) {
    if (input.keys.includes('forward')) this.mesh.translateZ(-this.speed * input.pressTime);
    if (input.keys.includes('left')) this.mesh.rotation.y += this.speed * input.pressTime;
    if (input.keys.includes('right')) this.mesh.rotation.y -= this.speed * input.pressTime;
  }
}

class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = this.onConnection.bind(this);
    this.ws.onmessage = this.processServerMessages.bind(this);

    this.serverUpdateRate = 10;

    this.id = null;

    this.entities = {};

    this.setUpdateRate(60);

    this.keys = {
      left: false,
      right: false
    };

    document.body.onkeydown = this.processEvents.bind(this);
    document.body.onkeyup = this.processEvents.bind(this);

    this.inputSequenceNumber = 0;
    this.pendingInputs = [];
  }

  onConnection() {
    console.log('Connected to server');

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.getElementById('container').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.z = 15;
    this.camera.position.y = 2;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    let light = new THREE.PointLight(0xffffff, 0.8, 18);
    light.position.set(3, 12, 3);
    light.castShadow = true;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 25;
    this.scene.add(light);

    let plane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshPhongMaterial({color:0xffffff})
    );
    plane.rotation.x -= Math.PI / 2;
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  processEvents(event) {
    if (event.key == 'w' || event.keyCode == 38) this.keys.forward = event.type == 'keydown';
    if (event.key == 'a' || event.keyCode == 37) this.keys.left = event.type == 'keydown';
    if (event.key == 'd' || event.keyCode == 39) this.keys.right = event.type == 'keydown';
  }

  processInputs() {
    let nowTs = +new Date();
    let lastTs = this.lastTs || nowTs;
    let dtSec = (nowTs - lastTs) / 1000.0;
    this.lastTs = nowTs;

    if ((!this.keys.left && !this.keys.right && !this.keys.forward) ||
         (this.keys.left && this.keys.right && !this.keys.forward)) {
      return;
    }

    let input = {
      id: this.id,
      pressTime: dtSec,
      inputSequenceNumber: this.inputSequenceNumber++,
      keys: ''
    };

    if (this.keys.forward) input.keys += 'forward';
    if (this.keys.left) input.keys += 'left';
    if (this.keys.right) input.keys += 'right';

    this.ws.send(JSON.stringify(input));

    // do client-side prediction
    this.entities[this.id].applyInput(input);

    // save this input for later reconciliation
    this.pendingInputs.push(input);
  }

  setUpdateRate(hz) {
    this.updateRate = hz;

    clearInterval(this.updateInterval);
    this.updateInterval = setInterval(this.update.bind(this), 1000 / this.updateRate);
  }

  update() {
    if (this.id == null) return;

    this.processInputs();
    this.interpolateEntities();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  processServerMessages(event) {
    let message = JSON.parse(event.data);

    switch(message.type) {
      case 'id':
        this.id = message.id;
        console.log(`Client ID set to: ${this.id}`);
        break;
      case 'worldState':
        for (let i = 0; i < message.states.length; i++) {
          let state = message.states[i];

          // if this is the first time we see this entity, create local representation
          if (!this.entities[state.id]) {
            let entity = new Entity(this.scene);
            entity.id = state.id;
            entity.setOrientation(state.position, state.rotation);

            if (state.id == this.id) entity.mesh.add(this.camera);

            this.entities[state.id] = entity;
          }

          let entity = this.entities[state.id];
          entity.updateHealth(state.health);

          if (state.id == this.id) {
            // received the authoritative positon of this client's entity
            entity.setOrientation(state.position, state.rotation);

            let j = 0;
            while (j < this.pendingInputs.length) {
              let input = this.pendingInputs[j];
              if (input.inputSequenceNumber <= state.lastProcessedInput) {
                // Already processed; its effect is already taken into
                // account into the world update.
                this.pendingInputs.splice(j, 1);
              } else {
                entity.applyInput(input);
                j++;
              }
            }
          } else {
            // received the position of an entity other than this client
            let timestamp = +new Date();
            entity.positionBuffer.push([timestamp, state.position, state.rotation]);
          }
        }
        break;
      case 'disconnect':
        if (this.entities[message.id]) {
          console.log(`Client ${message.id} disconnected`);
          this.scene.remove(this.entities[message.id].mesh);
          delete this.entities[message.id];
        }
        break;
    }
  }

  interpolateEntities() {
    let now = +new Date();
    let renderTimestamp = now - (1000.0 / this.serverUpdateRate);

    for (let i in this.entities) {
      let entity = this.entities[i];

      entity.healthBarPivot.lookAt(this.camera.getWorldPosition());

      if (entity.id == this.id) continue;

      let buffer = entity.positionBuffer;

      while (buffer.length >= 2 && buffer[1][0] <= renderTimestamp) {
        buffer.shift();
      }

      if (buffer.length >= 2 && buffer[0][0] <= renderTimestamp && renderTimestamp <= buffer[1][0]) {
        let p0 = buffer[0][1];
        let p1 = buffer[1][1];
        let r0 = buffer[0][2];
        let r1 = buffer[1][2];
        let t0 = buffer[0][0];
        let t1 = buffer[1][0];

        entity.mesh.position.x = p0.x + (p1.x - p0.x) * (renderTimestamp - t0) / (t1 - t0);
        entity.mesh.position.y = p0.y + (p1.y - p0.y) * (renderTimestamp - t0) / (t1 - t0);
        entity.mesh.position.z = p0.z + (p1.z - p0.z) * (renderTimestamp - t0) / (t1 - t0);

        entity.mesh.rotation.x = r0.x + (r1.x - r0.x) * (renderTimestamp - t0) / (t1 - t0);
        entity.mesh.rotation.y = r0.y + (r1.y - r0.y) * (renderTimestamp - t0) / (t1 - t0);
        entity.mesh.rotation.z = r0.z + (r1.z - r0.z) * (renderTimestamp - t0) / (t1 - t0);
      }
    }
  }
}

const client = new Client();