import { System } from 'ecsy';

import { Connection } from '../../../shared/components/connection';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    }
  };

  execute() {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.sendOutgoingMessages();
    });
  }
}
