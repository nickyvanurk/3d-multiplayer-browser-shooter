import { System } from 'ecsy';

import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { PlayerInputState } from '../../../shared/components/player-input-state';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    },
    players: {
      components: [Connection, PlayerInputState]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute() {
    this.queries.connections.added.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      this.queries.players.results.forEach((playerEntity) => {
        const { position, rotation } = playerEntity.getComponent(Transform);
        const kind = playerEntity.getComponent(Kind).value;
        connection.pushMessage(new Messages.Spawn(
          playerEntity.worldId,
          kind,
          position,
          rotation
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
