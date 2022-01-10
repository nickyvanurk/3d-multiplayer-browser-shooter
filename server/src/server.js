import express from 'express';
import path from 'path';
import WebSocket from 'ws';

import logger from './utils/logger';
import Client from './client';
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

      const client = this.createClient(clientId, ws);

      logger.info(`Client#${client.id} connected`);

      if (this.onClientConnectCallback) {
        this.onClientConnectCallback(client);
      }
    });

    const interval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.hasHeartbeat()) {
          client.terminate();
          logger.info(`Client#${client.id} terminated`);
        }
      });
    }, 30000); // 30 seconds

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  createClient(id, ws) {
    const client = new Client(id, ws);

    client.onClose(() => {
      this.destroyClient(id);

      logger.info(`Client#${id} disconnected`);

      if (this.onClientDisconnectCallback) {
        this.onClientDisconnectCallback(client);
      }
    });

    this.clients[client.id] = client;
    this.connectedClients++;

    return client;
  }

  destroyClient(id) {
    delete this.clients[id];
    this.connectedClients--;
  }

  onClientConnect(callback) {
    this.onClientConnectCallback = callback;
  }

  onClientDisconnect(callback) {
    this.onClientDisconnectCallback = callback;
  }
}
