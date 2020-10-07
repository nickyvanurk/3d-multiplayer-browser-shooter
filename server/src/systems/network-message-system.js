import { System } from 'ecsy';

import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    },
    entities: {
      components: [Transform, Kind]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute() {
    this.queries.connections.added.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      this.queries.entities.results.forEach((entity2) => {
        const { position, rotation, scale } = entity2.getComponent(Transform);
        const kind = entity2.getComponent(Kind).value;
        connection.pushMessage(new Messages.Spawn(
          entity2.worldId,
          kind,
          position,
          rotation,
          scale
        ));
      });
    });

    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.pushMessage(new Messages.World(this.worldServer.entities));
      connection.sendOutgoingMessages();
    });
  }
}
