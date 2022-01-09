import express from 'express';
import path from 'path';
import WebSocket from 'ws';

import logger from './utils/logger';
import Connection from './connection';
import Utils from './utils';

const app = express();

if (process.env.PRODUCTION) {
  app
    .use(express.static(path.join(__dirname, '../../client/public')))
    .get('*', (_req, res) => res.sendFile(path.join(__dirname, '../../client/public/index.html')));
}

export default class Server {
  constructor(port, maxClients) {
    this.maxClients = maxClients;
    this.connectedClients = 0;
    this.clients = new Array(this.maxClients);

    const server = app.listen(port, () => logger.info(`Server listening on port ${port}`));
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, _req) => {
      const clientId = Utils.findFreeIndex(this.clients, this.maxClients);

      if (clientId === -1) {
        return ws.close();
      }

      const connection = new Connection(clientId, ws);

      connection.onClose(() => {
        this.removeConnection(connection);

        if (this.onDisconnectCallback) {
          this.onDisconnectCallback(connection);
        }
      });

      // For testing
      connection.onMessage((message) => {
        logger.debug(`Client #${connection.id}: ${message}`);
      });

      this.addConnection(connection);

      if (this.onConnectionCallback) {
        this.onConnectionCallback(connection);
      }
    });

    const interval = setInterval(() => {
      this.clients.forEach((connection) => {
        if (connection.isAlive === false) return connection.terminate();

        connection.isAlive = false;
        connection.ws.ping();
      });
    }, 30000); // 30 seconds

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  addConnection(connection) {
    this.clients[connection.id] = connection;
    this.connectedClients++;
    logger.info(`Client #${connection.id} connected`);
  }

  removeConnection(connection) {
    delete this.clients[connection.id];
    this.connectedClients--;
    logger.info(`Client #${connection.id} disconnected`);
  }

  onConnection(callback) {
    this.onConnectionCallback = callback;
  }

  onDisconnect(callback) {
    this.onDisconnectCallback = callback;
  }
}
