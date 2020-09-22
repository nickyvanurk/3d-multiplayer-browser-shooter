import { System } from 'ecsy';
import WebSocket from 'ws';

import logger from '../utils/logger';
import createFixedTimestep from '../../../shared/utils/create-fixed-timestep';
import Types from '../../../shared/types';
import Utils from '../../../shared/utils';

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
      const connection = entity.getMutableComponent(Connection);
      const ws = connection.ws;

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('message', (data) => { this.handleMessage(connection, data); });
      
      this.sendMessage(connection, 'go');
    });

    this.queries.connections.results.forEach(entity => {
      const connection = entity.getComponent(Connection);
      const readyState = connection.ws.readyState;
      
      if (readyState === WebSocket.CLOSING ||
          readyState === WebSocket.CLOSED) {
        entity.removeComponent(Connection);
        logger.debug(`Player ${connection.id} removed`);
      }
    });

    this.pingUpdate(delta);
  }

  handleMessage(connection, data) {
    const message = JSON.parse(data);

    logger.debug(`Message from ${connection.id}: ${message}`);

    const messageType = parseInt(message[0]);

    if (messageType === Types.Messages.HELLO) {
      const name = Utils.sanitize(message[1]);
      
      if (name) {
        connection.name = name.substr(0, 15);
      }

      this.sendMessage(connection, [
        Types.Messages.WELCOME,
        connection.id,
        connection.name
      ]);
    }
  }

  sendMessage({ id, ws } = connection, data) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
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
