const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

app.use(express.static('public'));

class Entity() {
  constructor() {
    this.position = new THREE.Vector3();
  }
}

class Server {
  constructor(app) {
    this.httpServer = http.createServer(app);
    this.wss = new WebSocket.Server({server: this.httpServer});

    this.wss.on('connection', this.onConnection.bind(this));

    this.clients = {};
  }

  onConnection(client) {
    client.id = this.getAvailableClientId();
    console.log(`Client connected, set ID to: ${client.id}`);
    this.clients[client.id] = client;

    this.sendClientId(client);

    client.on('close', () => {
      console.log(`Client ${client.id} disconnected`);
      delete this.clients[client.id];
    });
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

  listen(port) {
    this.httpServer.listen(port, () => {
      console.log('listening on %d', this.httpServer.address().port);
    });
  }
}

const server = new Server(app);
server.listen(8080);
