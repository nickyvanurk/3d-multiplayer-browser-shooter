import logger from '../utils/logger';
import { System } from 'ecsy';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

export class NetworkSystem extends System {
  static queries: any = {
  };

  private connections!: Map<string, WebSocket>;
  private fixedUpdate!: Function;

  init() {
    this.connections = new Map();
    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));

    const wss = new WebSocket.Server({ port: +process.env.PORT! || 1337 });

    wss.on('connection', this.handleConnect.bind(this));
  }

  execute(delta: number) {
    this.fixedUpdate(delta);
  }

  handleFixedUpdate(delta: number) { }

  handleConnect(ws: WebSocket) {
    const id = uuidv4();

    this.connections.set(id, ws);

    ws.on('close', () => this.handleDisconnect(id));
    ws.on('error', () => this.handleDisconnect(id));
    ws.on('message', (data) => this.handleMessage(id, data));

    logger.info(`${id}: connected`);
  }

  handleDisconnect(id: string) {
    this.connections.delete(id);
    logger.info(`${id}: closed connection`);
  }

  handleMessage(id: string, data: WebSocket.Data) {
    logger.info(`${id}: ${data.toString()}`);
  }

  send(id: string, payload: object | string) {
    const ws = this.connections.get(id);

    if (!ws) return;

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    } catch (error) {
      console.error(`Error sending to player`);
    }
  }
}
