import { System } from 'ecsy';

import Types from '../../../shared/types';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';

export class NetworkEventSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    }
  };

  init(game) {
    this.game = game;
  }

  execute() {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message.type) {
          case Types.Messages.GO:
            connection.pushMessage(new Messages.Hello('Nicky'));
            break;
          case Types.Messages.WELCOME: {
            const { id, position, rotation } = message.data;
            const connection = entity.getMutableComponent(Connection).value;
            connection.id = id;
            console.log(`my id: ${id}`);
            this.game.addPlayer(id, position, rotation);
            break;
          }
          case Types.Messages.SPAWN: {
            const { id, kind, position, rotation } = message.data;
            console.log(`spawn id ${id}`);
            this.game.addEntity(id, kind, position, rotation);
            break;
          }
          case Types.Messages.DESPAWN: {
            const { id } = message.data;
            console.log(`despawn id ${id}`);
            this.game.removeEntity(id);
            break;
          }
          case Types.Messages.WORLD: {
            const entities = message.data;
            
            for (let i = 0; i < entities.length; ++i) {
              const entity = this.game.entities[entities[i].id];

              if (!entity) {
                console.error(`Entity${i} doesn't exist on client`);
                continue;
              }

              const transform = entity.getMutableComponent(Transform);
              transform.position.copy(entities[i].position);
              transform.rotation.copy(entities[i].rotation);
            }
            break;
          }
        }
      }
    });
  }
}
