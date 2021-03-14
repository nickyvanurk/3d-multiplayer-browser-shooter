import { System } from 'ecsy';

import logger from '../utils/logger';
import Messages from '../../../shared/messages';

import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';
import { Respawn } from '../components/respawn';
import { Spawned } from '../components/spawned';

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
        removed: true,
        changed: [Transform]
      }
    },
    spawnedEntities: {
      components: [Transform, Kind, Spawned],
      listen: { removed: true }
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute() {
    this.queries.connections.added.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.onDisconnect(() => { this.handlePlayerDisconnect(connection) });
      connection.pushMessage(new Messages.Go());

      this.queries.entities.results.forEach((entity2) => {
        const { position, rotation, scale } = entity2.getComponent(Transform);
        const kind = entity2.getComponent(Kind).value;
        connection.pushMessage(new Messages.Spawn(entity2.worldId, kind, position, rotation, scale));
      });

      connection.sendOutgoingMessages();
    });

    this.queries.entities.added.forEach((entity) => {
      if (!entity.alive) return;

      const { position, rotation, scale } = entity.getComponent(Transform);
      const kind = entity.getComponent(Kind).value;

      entity.addComponent(Spawned);

      logger.debug(`Broadcast: Spawn entity#${entity.worldId}`);
      this.broadcast(new Messages.Spawn(entity.worldId, kind, position, rotation, scale));
    });

    this.queries.spawnedEntities.removed.forEach((entity) => {
      if (entity.hasRemovedComponent(Transform)) {
        if (!entity.hasComponent(Respawn)) {
          delete this.world.entities[entity.worldId];
        }

        logger.debug(`Broadcast: Despawn entity#${entity.worldId}`);
        this.broadcast(new Messages.Despawn(entity.worldId));
      }
    });

    const changedEntities = this.queries.entities.changed.filter((entity) => {
      return entity.alive && entity.hasComponent(Transform)
    });

    if (changedEntities.length) {
      this.queries.connections.results.forEach((entity) => {
        const connection = entity.getComponent(Connection).value;
        connection.pushMessage(new Messages.World(changedEntities));
        connection.sendOutgoingMessages();
      });
    }
  }

  broadcast(message, ignoredPlayerId = null) {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      if (connection.id !== ignoredPlayerId && entity.alive) {
        connection.pushMessage(message);
      }
    });
  }

  handlePlayerDisconnect(connection) {
    this.queries.connections.results.forEach((entity) => {
      const connectionId = entity.getComponent(Connection).value.id;
      if (connection.id === connectionId) {
        logger.debug(`Deleting player${connection.id}`);
        entity.remove()
      }
    });

    this.worldServer.connectedClients--;
  }
}
