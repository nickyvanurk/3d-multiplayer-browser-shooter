import WebSocket from 'ws';
import Server from './server';

const wss = new WebSocket.Server({ port: 1337 });
const server = new Server();

wss.on('connection', (ws: WebSocket) => {
  server.register(ws);
});
