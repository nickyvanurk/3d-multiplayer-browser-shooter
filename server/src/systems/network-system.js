import { System } from 'ecsy';

import logger from '../utils/logger';
import { Connection } from '../components/connection';
import { HelloMessage } from '../components/messages/hello-message';

export class NetworkSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    }
  };

  init(worldServer) {
    this.server = worldServer;
  }

  execute() {
    this.queries.connections.added.forEach(entity => {
      const connection = entity.getMutableComponent(Connection).value;

      connection.onMessage((message) => {
        logger.debug(`Message from ${connection.id}: ${message}`);
        
        switch (message) {
          case 'hello':
            entity.addComponent(HelloMessage, {
              id: connection.id,
              name: 'UNKNOWN'
            });
            break;
        }
      }); 

      connection.onDisconnect(() => {
        this.server.handlePlayerDisconnect(connection);
      });

      connection.send('go');
    });
  }
}
