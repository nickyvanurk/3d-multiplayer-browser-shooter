import WebSocket from 'ws';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';

import Connection from './connection.js';
import type { ClientSocket } from './connection.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.PRODUCTION) {
  app
    .use(express.static(path.join(__dirname, '../../client/dist')))
    .get('*', (_req, res) =>
      res.sendFile(path.join(__dirname, '../../client/dist/index.html')),
    );
}

export default class Server {
  maxClients: number;
  connectedClients: number;
  clients: (Connection | undefined)[];
  wss: WebSocket.Server;
  onConnectionCallback?: (connection: Connection) => void;
  onErrorCallback?: (error: Error) => void;

  constructor(port: number, maxClients: number) {
    this.maxClients = maxClients;
    this.connectedClients = 0;
    this.clients = new Array(this.maxClients).fill(undefined);

    const server = app.listen(port, () => console.log(`Listening on ${port}`));
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (connection: WebSocket, req: IncomingMessage) => {
      const clientId = this.findFreeClientIndex();

      if (clientId === -1) {
        connection.close();
        return;
      }

      (connection as ClientSocket).remoteAddress = req.socket.remoteAddress;
      const con = new Connection(clientId, connection as ClientSocket, this);

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

  onConnection(callback: (connection: Connection) => void): void {
    this.onConnectionCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  addConnection(connection: Connection): void {
    this.clients[connection.id] = connection;
    this.connectedClients++;
  }

  removeConnection(id: number): void {
    delete this.clients[id];
    this.connectedClients--;
  }

  getConnection(id: number): Connection | undefined {
    return this.clients[id];
  }

  findFreeClientIndex(): number {
    for (let i = 0; i < this.maxClients; ++i) {
      if (!this.clients[i]) {
        return i;
      }
    }

    return -1;
  }
}
