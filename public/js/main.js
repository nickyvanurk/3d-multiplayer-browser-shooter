class Entity {
  constructor(scene, position) {
    this.speed = 2; // units/s
    this.positionBuffer = [];
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({color: 0xff0000})
    );
    scene.add(this.mesh);
  }

  setPosition(position) {
    this.mesh.position.set(position.x, position.y, position.z);
  }

  applyInput(input) {
    if (input.key === 'left') this.mesh.position.x -= this.speed * input.pressTime;
    if (input.key === 'right') this.mesh.position.x += this.speed * input.pressTime;
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
    document.getElementById('container').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.z = 50;

    let light = new THREE.PointLight(0xFFFFFF);
    light.position.set(10, 0, 10);
    this.scene.add(light);
    this.scene.add(new THREE.HemisphereLight());
  }

  processEvents(event) {
    if (event.keyCode == 37) this.keys.left = event.type == 'keydown';
    else if (event.key == 'a') this.keys.left = event.type == 'keydown';
    if (event.keyCode == 39) this.keys.right = event.type == 'keydown';
    else if (event.key == 'd') this.keys.right = event.type == 'keydown';
  }

  processInputs() {
    let nowTs = +new Date();
    let lastTs = this.lastTs || nowTs;
    let dtSec = (nowTs - lastTs) / 1000.0;
    this.lastTs = nowTs;

    if ((!this.keys.left && !this.keys.right) ||
         (this.keys.left && this.keys.right)) {
      return;
    }

    let input = {id: this.id, pressTime: dtSec, inputSequenceNumber: this.inputSequenceNumber++};
    if (this.keys.left) input.key = 'left';
    if (this.keys.right) input.key = 'right';

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
            entity.setPosition(state.position);
            this.entities[state.id] = entity;
          }

          let entity = this.entities[state.id];

          if (state.id == this.id) {
            // received the authoritative positon of this client's entity
            entity.setPosition(state.position);

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
            entity.positionBuffer.push([timestamp, state.position]);
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

      if (entity.id == this.id) continue;

      let buffer = entity.positionBuffer;

      while (buffer.length >= 2 && buffer[1][0] <= renderTimestamp) {
        buffer.shift();
      }

      if (buffer.length >= 2 && buffer[0][0] <= renderTimestamp && renderTimestamp <= buffer[1][0]) {
        let p0 = buffer[0][1];
        let p1 = buffer[1][1];
        let t0 = buffer[0][0];
        let t1 = buffer[1][0];

        entity.mesh.position.x = p0.x + (p1.x - p0.x) * (renderTimestamp - t0) / (t1 - t0);
        entity.mesh.position.y = p0.y + (p1.y - p0.y) * (renderTimestamp - t0) / (t1 - t0);
        entity.mesh.position.z = p0.z + (p1.z - p0.z) * (renderTimestamp - t0) / (t1 - t0);
      }
    }
  }
}

const client = new Client();