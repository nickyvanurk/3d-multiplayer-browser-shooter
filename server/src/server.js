import WebSocket from 'ws';

import Connection from './connection';

export default class Server {
  constructor(port, maxClients) {
    this.maxClients = maxClients;
    this.connectedClients = 0;
    this.clients = new Array(this.maxClients).fill();

    this.wss = new WebSocket.Server({ port });

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

