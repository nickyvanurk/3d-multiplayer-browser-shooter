import { System } from 'ecsy';

import logger from '../utils/logger';
import Messages from '../../../shared/messages';

import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';
import { Respawn } from '../components/respawn';
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
        removed: true,
        changed: [Transform]
      }
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
    this.clients = [];
  }

  execute() {
    this.queries.connections.added.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      const clientId = this.getClientId();
      connection.id = clientId;
      this.clients[clientId] = entity;
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
      this.broadcast(new Messages.Spawn(entity.worldId, kind, position, rotation, scale));
    });

    this.queries.entities.removed.forEach((entity) => {
      if (entity.hasRemovedComponent(Transform)) {
        if (!entity.hasComponent(Respawn)) {
          delete this.world.entities[entity.worldId];
        }

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
    for (const [id, entity] of this.clients.entries()) {
      if (id == ignoredPlayerId || !entity || !entity.alive || entity.hasComponent(Destroy) ||
          !entity.hasComponent(Connection)) {
        continue;
      }

      const connection = entity.getComponent(Connection).value;
      connection.pushMessage(message);
    }
  }

  handlePlayerDisconnect(connection) {
    logger.debug(`Deleting player ${connection.id}`);
    this.clients[connection.id].remove();
    this.worldServer.connectedClients--;
    delete this.clients[connection.id];
  }

  getClientId() {
    for (let i = 0; i < this.clients.length; ++i) {
      if (!this.clients[i]) {
        return i;
      }
    }

    return this.clients.length;
  }
}
