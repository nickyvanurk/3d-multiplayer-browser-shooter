import { System } from 'ecsy';

import Messages from '../../../shared/messages';

import { Connection } from '../components/destroy';
import { Playing } from '../components/destroy';
import { Destroy } from '../components/destroy';

export class DestroySystem extends System {
  static queries = {
    entities: {
      components: [Destroy]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute(_delta, _time) {
    this.queries.entities.results.forEach((entity) => {
      if (entity.hasComponent(Connection)) {
        if (entity.hasComponent(Playing)) {
          this.worldServer.broadcast(new Messages.Despawn(entity.worldId));
        }
      } else {
          this.worldServer.broadcast(new Messages.Despawn(entity.worldId));
      }

      delete this.worldServer.entities[entity.worldId];
      entity.remove();
    });
  }
}
