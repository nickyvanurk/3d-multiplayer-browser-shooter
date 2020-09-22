import { System } from 'ecsy';
import WebSocket from 'ws';

import logger from '../utils/logger';
import createFixedTimestep from '../../../shared/utils/create-fixed-timestep';

import { Connection } from '../components/connection';

export class NetworkSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    }
  };

  init() {
    this.pingUpdate = createFixedTimestep(5000, this.ping.bind(this));
  }

  execute(delta) {
    this.queries.connections.added.forEach(entity => {
      const ws = entity.getComponent(Connection).ws;

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
    });

    this.queries.connections.results.forEach(entity => {
      const connection = entity.getComponent(Connection);
      const readyState = connection.ws.readyState;
      
      if (readyState === WebSocket.CLOSING ||
          readyState === WebSocket.CLOSED) {
        entity.removeComponent(Connection);
        logger.info(`Player ${connection.id} removed`);
      }
    });

    this.pingUpdate(delta);
  }

  ping() {
    this.queries.connections.results.forEach(entity => {
      const ws = entity.getComponent(Connection).ws;

      if (!ws.isAlive) {
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping(() => {});
    });
  }
}
