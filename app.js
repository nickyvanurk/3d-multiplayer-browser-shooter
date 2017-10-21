const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const THREE = require('three');

const app = express();

app.use(express.static('public'));

class Entity {
  constructor(size) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshLambertMaterial({color: 0xff0000})
    );
  }
}

class Player extends Entity {
  constructor() {
    super(new THREE.Vector3(1, 1, 1));

    this.speed = 2; // units/s
    this.health = 100;
  }

  applyInput(input) {
    if (input.keys.includes('forward')) this.mesh.translateZ(-this.speed * input.pressTime);
    if (input.keys.includes('left')) this.mesh.rotation.y += this.speed * input.pressTime;
    if (input.keys.includes('right')) this.mesh.rotation.y -= this.speed * input.pressTime;
  }
}

class Server {
  constructor(app) {
    this.httpServer = http.createServer(app);
    this.wss = new WebSocket.Server({server: this.httpServer});

    this.wss.on('connection', this.onConnection.bind(this));

    this.clients = {};
    this.players = {};

    this.lastProcessedInput = [];

    this.setUpdateRate(10);
  }

  onConnection(client) {
    client.id = this.getAvailableClientId();
    console.log(`Client connected, set ID to: ${client.id}`);
    this.clients[client.id] = client;

    this.sendClientId(client);

    let player = new Player();
    player.id = client.id;
    player.mesh.position.x = Math.floor(Math.random() * 10) + 1;
    player.mesh.position.y = player.mesh.geometry.parameters.height / 2;
    player.mesh.position.z = Math.floor(Math.random() * 10) + 1;
    this.players[player.id] = player;

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
      this.players[message.id].applyInput(message);
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
      let player = this.players[client.id];
      worldState.push({
        id: player.id,
        position: {
          x: player.mesh.position.x,
          y: player.mesh.position.y,
          z: player.mesh.position.z
        },
        rotation: {
          x: player.mesh.rotation.x,
          y: player.mesh.rotation.y,
          z: player.mesh.rotation.z
        },
        lastProcessedInput: this.lastProcessedInput[client.id],
        health: player.health
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
