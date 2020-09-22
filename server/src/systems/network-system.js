import { System } from 'ecsy';
import WebSocket from 'ws';

import logger from '../utils/logger';

import { Connection } from '../components/connection';

export class NetworkSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    }
  };

  execute() {
    this.queries.connections.results.forEach(entity => {
      const connection = entity.getComponent(Connection);
      const readyState = connection.ws.readyState;

      if (readyState === WebSocket.CLOSING ||
          readyState === WebSocket.CLOSED) {
        entity.removeComponent(Connection);
        logger.info(`Player ${connection.id} removed`);
      }
    });
  }
}
