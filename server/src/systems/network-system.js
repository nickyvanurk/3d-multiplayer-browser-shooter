import { System } from 'ecsy';
import WebSocket from 'ws';

import logger from '../utils/logger';
import createFixedTimestep from '../../../shared/utils/create-fixed-timestep';

import { Connection } from '../../../shared/components/connection';

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
      const connection = entity.getComponent(Connection);
      const ws = connection.ws;

      ws.isAlive = true;
      ws.on('message', (data) => { this.handleMessage(connection, data); });
      ws.on('pong', () => { ws.isAlive = true; });
      
      // TODO: Shared message types
      // Think about code re-use for client and server
      // Implement network-system for client
      // Spawn player
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

  handleMessage(connection, data) {
    console.info(`Message from client: ${data}`);
  
    this.sendMessage(connection, 'Hello');
  }

  sendMessage({ id, ws } = connection, data) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    } catch {
      logger.warning(`Error sending to ${id}`);
    }
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
