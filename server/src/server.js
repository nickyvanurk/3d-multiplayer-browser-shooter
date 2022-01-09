import express from 'express';
import path from 'path';
import WebSocket from 'ws';

import logger from './utils/logger';

const app = express();

if (process.env.PRODUCTION) {
  app
    .use(express.static(path.join(__dirname, '../../client/public')))
    .get('*', (_req, res) => res.sendFile(path.join(__dirname, '../../client/public/index.html')));
}

export default class Server {
  constructor(port, maxClients) {
    this.maxClients = maxClients;

    const server = app.listen(port, () => logger.info(`Server listening on port ${port}`));
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (connection, _req) => {
      if (this.onConnectionCallback) {
        this.onConnectionCallback(connection);
      }
    });
  }

  onConnection(callback) {
    this.onConnectionCallback = callback;
  }
}
