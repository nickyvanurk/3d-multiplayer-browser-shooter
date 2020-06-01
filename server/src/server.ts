import logger from './utils/logger';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

import World from './world';

export class Server {
  private sessions: Map<string, Session>;
  private world: World;

  constructor() {
    this.sessions = new Map();
    this.world = new World(+process.env.MAX_PLAYERS!, this);

    this.world.run();
  }

  register(ws: WebSocket) {
    const id = uuidv4();
    const session = { id, ws };

    this.sessions.set(id, session);

    ws.on('close', () => this.unregister(id));
    ws.on('error', () => this.unregister(id));
    ws.on('message', (data) => this.handleMessage(id, data.toString()));

    this.world.addPlayer(session);
  }

  unregister(id: string) {
    this.sessions.delete(id);
    logger.info(`${id}: closed connection`);
  }

  handleMessage(id: string, data: string) {
    const session = this.sessions.get(id);

    if (!session) {
      logger.error(`Can't find session ${id}`);
      return;
    }

    this.send(session, `You have been assigned id ${id}`);
  }

  send(session: Session, payload: object | string) {
    try {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(payload));
      }
    } catch (error) {
      logger.error(`Error sending to ${session.id}`);
    }
  }
}

export type Session = {
  id: string,
  ws: WebSocket
};
