import logger from './utils/logger';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export default class Server {
  private sessions: Map<string, Session>;

  constructor() {
    this.sessions = new Map();
  }

  register(ws: WebSocket) {
    const id = uuidv4();
    const session = { id, ws };

    this.sessions.set(id, session);

    ws.on('close', () => this.unregister(id));
    ws.on('error', () => this.unregister(id));
    ws.on('message', (data) => this.handleMessage(id, data.toString()));
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

    logger.info(`${id}: ${data}`);

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

type Session = {
  id: string,
  ws: WebSocket
}
