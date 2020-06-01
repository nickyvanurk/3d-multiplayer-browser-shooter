import dotenv from 'dotenv';
import WebSocket from 'ws';
import { Server } from './server';

dotenv.config();

const wss = new WebSocket.Server({ port: +process.env.PORT! || 1337 });
const server = new Server();

wss.on('connection', (ws: WebSocket) => {
  server.register(ws);
});
