import logger from './utils/logger';
import WebSocket from 'ws';

const wss = new WebSocket.Server({ port: 1337 });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (message: WebSocket.Data) => {
    logger.info(`received: ${message}`);
  });

  ws.send('something');
});
