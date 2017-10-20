const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const THREE = require('three');

const app = express();

app.use(express.static('public'));

class Entity {
  constructor() {
    this.height = 1;
    this.speed = 2; // units/s
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, this.height, 1),
      new THREE.MeshLambertMaterial({color: 0xff0000})
    );
  }

  applyInput(input) {
    if (input.key === 'forward') this.mesh.translateZ(-this.speed * input.pressTime);
    if (input.key === 'left') this.mesh.rotation.y += this.speed * input.pressTime;
    if (input.key === 'right') this.mesh.rotation.y -= this.speed * input.pressTime;
  }
}

class Server {
  constructor(app) {
    this.httpServer = http.createServer(app);
    this.wss = new WebSocket.Server({server: this.httpServer});

    this.wss.on('connection', this.onConnection.bind(this));

    this.clients = {};
    this.entities = {};

    this.lastProcessedInput = [];

    this.setUpdateRate(10);
  }

  onConnection(client) {
    client.id = this.getAvailableClientId();
    console.log(`Client connected, set ID to: ${client.id}`);
    this.clients[client.id] = client;

    this.sendClientId(client);

    let entity = new Entity();
    entity.id = client.id;
    entity.mesh.position.x = Math.floor(Math.random() * 10) + 1;
    entity.mesh.position.y = entity.height / 2;
    entity.mesh.position.z = Math.floor(Math.random() * 10) + 1;
    this.entities[entity.id] = entity;

    client.on('message', function (msg) {
      this.processInputs(msg, client);
    }.bind(this));

    client.on('close', () => {
      console.log(`Client ${client.id} disconnected`);
      delete this.clients[client.id];

      this.broadcastClientDisconnect(client);
    });
  }

  validateInput(input, clientId) {
    return clientId === input.id && input.pressTime < 1 / 40;
  }

  processInputs(msg, client) {
    let message = JSON.parse(msg);

    if (this.validateInput(message, client.id)) {
      this.entities[message.id].applyInput(message);
      this.lastProcessedInput[message.id] = message.inputSequenceNumber;
    }
  }

  getAvailableClientId() {
    for (let i = 0; i < Object.keys(this.clients).length; i++) {
      if (!this.clients.hasOwnProperty(i)) return i;
    }

    return Object.keys(this.clients).length;
  }

  sendClientId(client) {
    client.send(JSON.stringify({type: 'id', id: client.id}));
  }

  broadcastClientDisconnect(client) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        this.clients[key].send(JSON.stringify({
          type: 'disconnect',
          id: client.id
        }));
      }
    }
  }

  setUpdateRate(hz) {
    this.updateRate = hz;

    clearInterval(this.updateInterval);
    this.updateInterval = setInterval(this.update.bind(this), 1000 / this.updateRate);
  }

  update() {
    this.sendWorldState();
  }

  sendWorldState() {
    let worldState = [];
    for (let key in this.clients) {
      let client = this.clients[key];
      let entity = this.entities[client.id];
      worldState.push({
        id: entity.id,
        position: {
          x: entity.mesh.position.x,
          y: entity.mesh.position.y,
          z: entity.mesh.position.z
        },
        rotation: {
          x: entity.mesh.rotation.x,
          y: entity.mesh.rotation.y,
          z: entity.mesh.rotation.z
        },
        lastProcessedInput: this.lastProcessedInput[client.id]
      });
    }

    for (const key in this.clients) {
      const client = this.clients[key];
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'worldState',
          states: worldState
        }));
      }
    }
  }

  listen(port) {
    this.httpServer.listen(port, () => {
      console.log('listening on %d', this.httpServer.address().port);
    });
  }
}

const server = new Server(app);
server.listen(8080);
