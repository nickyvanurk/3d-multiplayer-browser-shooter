import { System } from 'ecsy';

import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';
import { Destroy } from '../components/destroy';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    },
    entities: {
      components: [Transform, Kind],
      listen: {
        added: true,
        removed: true
      }
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
          entity2.id,
          kind,
          position,
          rotation,
          scale
        ));
      });
    });

    this.queries.entities.added.forEach((entity) => {
      if (!entity.alive) return;
      const { position, rotation, scale } = entity.getComponent(Transform);
      const kind = entity.getComponent(Kind).value;
      this.worldServer.broadcast(new Messages.Spawn(entity.id, kind, position, rotation, scale));
    });

    this.queries.entities.removed.forEach((entity) => {
      if (entity.hasRemovedComponent(Transform)) {
        this.worldServer.broadcast(new Messages.Despawn(entity.id));
      }
    });

    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.pushMessage(new Messages.World(
        this.worldServer.world.entityManager._entities.filter(entity => {
          return entity.hasComponent(Transform) && !entity.hasComponent(Destroy)
        })
      ));
      connection.sendOutgoingMessages();
    });
  }
}
