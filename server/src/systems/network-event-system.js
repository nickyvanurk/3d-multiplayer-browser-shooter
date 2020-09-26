import { System } from 'ecsy';

import Utils from '../../../shared/utils';
import Types from '../../../shared/types';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../../../shared/components/transform';

export class NetworkEventSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    }
  };

  init(worldServer) {
    this.server = worldServer;
  }

  execute() {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
        
      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message.type) {
          case Types.Messages.HELLO: {
            let { name } = message.data;
            name = Utils.sanitize(name); 
            name = !name ? 'UNKNOWN' : name.substr(0, 15);  

            const players = Object.values(this.server.players).filter((entity) => {
              return entity.hasComponent(Transform);
            });


            this.server.addPlayer(connection.id);
            const { position, rotation } = entity.getComponent(Transform);

            connection.pushMessage(new Messages.Welcome(
              connection.id,
              name,
              position,
              rotation,
              players
            ));

            this.queries.connections.results.forEach((playerEntity) => {
              if (entity === playerEntity) {
                return;
              }

              const connection = playerEntity.getComponent(Connection).value;
              connection.pushMessage(new Messages.Spawn(position, rotation));
            });
            break;
          }
        }
      }
    });
  }
}
