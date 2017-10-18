class Entity {
  constructor(scene, position) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({color: 0xff0000})
    );
    scene.add(this.mesh);
  }

  setPosition(position) {
    this.mesh.position.set(position.x, position.y, position.z);
  }
}

class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = this.onConnection.bind(this);
    this.ws.onmessage = this.processServerMessages.bind(this);

    this.id = null;

    this.entities = {};

    this.setUpdateRate(60);
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

  setUpdateRate(hz) {
    this.updateRate = hz;

    clearInterval(this.updateInterval);
    this.updateInterval = setInterval(this.update.bind(this), 1000 / this.updateRate);
  }

  update() {
    if (this.id == null) return;

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
            this.entities[state.id] = entity;
          }

          let entity = this.entities[state.id];

          entity.setPosition(state.position);
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
}

const client = new Client();