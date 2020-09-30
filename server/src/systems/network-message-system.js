import { System } from 'ecsy';

import { Connection } from '../../../shared/components/connection';
import Messages from '../../../shared/messages';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute() {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.pushMessage(new Messages.World(this.worldServer.entities));
      connection.sendOutgoingMessages();
    });
  }
}
