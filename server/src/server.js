import WebSocket from 'ws';
const express = require('express');
const app = express();
const path = require('path');

import Connection from './connection';

if (process.env.PRODUCTION) {
  app
    .use(express.static(path.join(__dirname, '../../client/public')))
    .get('*', (_req, res) => res.sendFile(path.join(__dirname, '../../client/public/index.html')))
}

export default class Server {
  constructor(port, maxClients) {
    this.maxClients = maxClients;
    this.connectedClients = 0;
    this.clients = new Array(this.maxClients).fill();

    const server = app.listen(port, () => console.log(`Listening on ${port}`));
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (connection, req) => {
      const clientId = this.findFreeClientIndex();

      if (clientId === -1) {
        connection.close();
        return;
      }

      connection.remoteAddress = req.socket.remoteAddress;
      const con = new Connection(clientId, connection, this);

      if (this.onConnectionCallback) {
        this.onConnectionCallback(con);
      }

      this.addConnection(con);
    });

    this.wss.on('error', (error) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    });
  }

  onConnection(callback) {
    this.onConnectionCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  addConnection(connection) {
    this.clients[connection.id] = connection;
    this.connectedClients++;
  }

  removeConnection(id) {
    delete this.clients[id];
    this.connectedClients--;
  }

  getConnection(id) {
    return this.clients[id];
  }

  findFreeClientIndex() {
    for (let i = 0; i < this.maxClients; ++i) {
      if (!this.clients[i]) {
        return i;
      }
    }

    return -1;
  }
}

