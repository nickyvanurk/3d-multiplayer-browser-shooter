import WebSocket from 'ws';

import Utils from '../../shared/utils';
import Connection from './connection';

export default class Server {
  constructor(port) {
    this.connections = {};
    this.counter = 0;

    this.wss = new WebSocket.Server({ port });

    this.wss.on('connection', (connection, req) => {
      connection.remoteAddress = req.socket.remoteAddress;

      const con = new Connection(this.createId(), connection, this);

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
    this.connections[connection.id] = connection;
  }

  removeConnection(id) {
    delete this.connections[id];
  }
  
  getConnection(id) {
    return this.connections[id];
  }

  createId() {
    return +('5' + Utils.random(99) + '' + (this.counter++));
  }
}

